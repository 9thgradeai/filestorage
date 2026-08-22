import request from 'supertest';
import app from '../index';
import { StatusCodes } from 'http-status-codes';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// The AI controller instantiates Groq at module load; swap the whole SDK for
// a controllable mock whose `create` behaviour each test arranges.
const mockCreate = jest.fn();
jest.mock('groq-sdk', () => {
  return class MockGroq {
    // Lazy indirection: the controller imports this module before test-body
    // initializers run, so `create` must resolve mockCreate at call time.
    chat = { completions: { create: (...args: unknown[]) => mockCreate(...(args as [])) } };
    constructor(_opts?: Record<string, unknown>) {}
  };
});

const GROQ_KEY_BACKUP = process.env.GROQ_API_KEY;

describe('AI Controller — POST /api/ai/chat', () => {
  let dbPool: Pool;
  let testUserId: number;
  let authToken: string;

  const plainCompletion = (content: string) => ({
    choices: [{ message: { role: 'assistant', content, tool_calls: undefined } }],
  });

  beforeAll(async () => {
    dbPool = new Pool({
      user: process.env.DB_TEST_USER || 'postgres',
      host: process.env.DB_TEST_HOST || 'localhost',
      database: process.env.DB_TEST_NAME || 'filestorage_test',
      password: process.env.DB_TEST_PASSWORD || 'password',
      port: parseInt(process.env.DB_TEST_PORT || '5432', 10),
    });

    await dbPool.query('TRUNCATE TABLE users RESTART IDENTITY CASCADE');
    await dbPool.query('TRUNCATE TABLE files RESTART IDENTITY CASCADE');
    await dbPool.query('TRUNCATE TABLE folders RESTART IDENTITY CASCADE');

    const hashedPassword = await bcrypt.hash('TestPass123!', 12);
    const userResult = await dbPool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id',
      ['aiuser@example.com', hashedPassword]
    );
    testUserId = userResult.rows[0].id;

    authToken = jwt.sign({ id: testUserId }, process.env.JWT_SECRET || 'test-secret', {
      expiresIn: '1h',
    });
  });

  afterAll(async () => {
    await dbPool.end();
    // Restore whatever the ambient environment had.
    if (GROQ_KEY_BACKUP === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = GROQ_KEY_BACKUP;
  });

  beforeEach(() => {
    mockCreate.mockReset();
    process.env.GROQ_API_KEY = 'test-groq-key';
  });

  it('should reject unauthenticated requests', async () => {
    await request(app)
      .post('/api/ai/chat')
      .send({ message: 'hello' })
      .expect(StatusCodes.UNAUTHORIZED);
  });

  it('should reject an empty message', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ message: '   ' })
      .expect(StatusCodes.BAD_REQUEST);

    expect(res.body.message).toContain('required');
  });

  it('should return a config-missing fallback when no API key is set', async () => {
    delete process.env.GROQ_API_KEY;

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ message: 'hello' })
      .expect(StatusCodes.OK);

    expect(res.body.intent).toBe('config_missing');
    expect(res.body.type).toBe('text');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should answer conversationally without tool calls', async () => {
    mockCreate.mockResolvedValueOnce(plainCompletion('Hi! How can I help with your files?'));

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ message: 'hello there' })
      .expect(StatusCodes.OK);

    expect(res.body.response).toBe('Hi! How can I help with your files?');
    expect(res.body.type).toBe('text');
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('should strip <think> blocks from model output', async () => {
    mockCreate.mockResolvedValueOnce(
      plainCompletion('<think>internal reasoning</think>Here is your answer.')
    );

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ message: 'what can you do?' })
      .expect(StatusCodes.OK);

    expect(res.body.response).toBe('Here is your answer.');
    expect(res.body.response).not.toContain('<think>');
  });

  describe('tool-call flow (against real DB)', () => {
    beforeEach(async () => {
      await dbPool.query(
        `INSERT INTO files (user_id, original_filename, stored_filename, s3_key, file_size, mime_type)
         VALUES ($1, 'quarterly-report.pdf', $2, $3, 2048, 'application/pdf')`,
        [testUserId, `stored-${Date.now()}-a.pdf`, `${testUserId}/stored-${Date.now()}-a.pdf`]
      );
    });

    afterEach(async () => {
      await dbPool.query('DELETE FROM files WHERE user_id = $1', [testUserId]);
    });

    it('should execute search_files and surface file cards', async () => {
      const toolCallMsg = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'search_files', arguments: JSON.stringify({ query: 'quarterly' }) },
          },
        ],
      };

      mockCreate
        .mockResolvedValueOnce({ choices: [{ message: toolCallMsg }] })
        .mockResolvedValueOnce(plainCompletion('I found your quarterly report.'));

      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ message: 'find my quarterly report' })
        .expect(StatusCodes.OK);

      // First call carries tools + user message; second is the follow-up.
      expect(mockCreate).toHaveBeenCalledTimes(2);

      const toolPayload = JSON.parse(mockCreate.mock.calls[1][0].messages.at(-1).content);
      expect(toolPayload.type).toBe('files');
      expect(toolPayload.data[0].name).toBe('quarterly-report.pdf');

      expect(res.body.type).toBe('files');
      expect(res.body.data[0]).toMatchObject({
        name: 'quarterly-report.pdf',
        sizeBytes: '2048',
      });
      expect(res.body.response).toBe('I found your quarterly report.');
    });

    it('should tolerate malformed tool arguments without crashing', async () => {
      const toolCallMsg = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_2',
            type: 'function',
            function: { name: 'search_files', arguments: '{not-json' },
          },
        ],
      };

      mockCreate
        .mockResolvedValueOnce({ choices: [{ message: toolCallMsg }] })
        .mockResolvedValueOnce(plainCompletion('Nothing found.'));

      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ message: 'search for something' })
        .expect(StatusCodes.OK);

      // Malformed args fail that one tool gracefully: request still succeeds,
      // returns the model's summary as text — never a 500 or the generic
      // provider-error copy.
      expect(res.body.type).toBe('text');
      expect(res.body.response).toBe('Nothing found.');
      expect(res.body.response).not.toContain('trouble connecting');
    });

    it('should trash exactly one matching file via trash_file', async () => {
      const toolCallMsg = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call_3',
            type: 'function',
            function: { name: 'trash_file', arguments: JSON.stringify({ name: 'quarterly-report' }) },
          },
        ],
      };

      mockCreate
        .mockResolvedValueOnce({ choices: [{ message: toolCallMsg }] })
        .mockResolvedValueOnce(plainCompletion('Done, moved to trash.'));

      const res = await request(app)
        .post('/api/ai/chat')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ message: 'trash my report' })
        .expect(StatusCodes.OK);

      expect(res.body.type).toBe('text');
      expect(res.body.response).toBe('Done, moved to trash.');

      const { rows } = await dbPool.query(
        'SELECT trashed_at FROM files WHERE user_id = $1 AND original_filename = $2',
        [testUserId, 'quarterly-report.pdf']
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].trashed_at).not.toBeNull();
    });
  });

  it('should map Groq 429s to a friendly rate-limit message', async () => {
    mockCreate.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }));

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ message: 'hello' })
      .expect(StatusCodes.OK);

    expect(res.body.response).toContain('try again in a moment');
  });

  it('should fall back to a generic message on provider errors', async () => {
    mockCreate.mockRejectedValueOnce(new Error('connection refused'));

    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ message: 'hello' })
      .expect(StatusCodes.OK);

    expect(res.body.response).toContain('trouble connecting');
  });
});
