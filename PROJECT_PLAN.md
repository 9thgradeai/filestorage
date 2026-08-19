# Secure File Storage Service - Project Plan

## Overview
Build a secure file storage application where authenticated users can upload, manage, and share files. Users should be able to register, log in, upload files, organize them in their personal dashboard, and control whether each file is public or private. Public files should be accessible via a shareable link, while private files must only be accessible to their owner through proper authorization. The application should support uploading files of at least 100 MB while providing appropriate validation, upload progress, and error handling.

## Technology Stack
- **Backend**: Node.js with Express.js
- **Frontend**: React with Next.js
- **Database**: PostgreSQL
- **Storage**: AWS S3 (primary) + Cloudinary (for image optimization)
- **Authentication**: JWT (JSON Web Tokens) with bcrypt password hashing
- **Deployment**: Docker containers, Vercel (frontend), AWS ECS (backend) or Vercel for full-stack
- **Additional Tools**: 
  - Multer for file upload handling
  - Helmet for security headers
  - Rate limiting (express-rate-limit)
  - CORS middleware
  - Joi or Yup for input validation
  - AWS SDK for S3
  - Cloudinary SDK

## Database Schema
```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Files table
CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) UNIQUE NOT NULL,
  s3_key VARCHAR(512) UNIQUE NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100),
  is_public BOOLEAN DEFAULT FALSE,
  share_token VARCHAR(64) UNIQUE, -- For public shareable links
  share_expires_at TIMESTAMP,     -- Optional expiration for public links
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_files_user_id ON files(user_id);
CREATE INDEX idx_files_is_public ON files(is_public);
CREATE INDEX idx_files_share_token ON files(share_token);
```

## API Endpoints
### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login (returns JWT)
- `POST /api/auth/logout` - Invalidate token (client-side)

### File Operations
- `POST /api/files/upload` - Upload a file (requires auth)
- `GET /api/files` - List user's files (requires auth)
- `GET /api/files/:id` - Get file metadata (requires auth or public access)
- `DELETE /api/files/:id` - Delete a file (requires auth and ownership)
- `PUT /api/files/:id/toggle-public` - Toggle public/private status (requires auth and ownership)
- `GET /api/files/:id/download` - Download file (requires auth or valid public link)
- `GET /api/files/public/:shareToken` - Access public file via shareable link

### Security & Utilities
- `GET /api/health` - Health check endpoint
- `POST /api/files/:id/validate` - Validate file (server-side virus scan, etc.)

## Security Considerations (Based on OWASP File Upload Cheat Sheet & Azure API Design Best Practices)

### File Upload Security
1. **File Type Validation**:
   - Validate both file extension and MIME type
   - Maintain whitelist of allowed file types (e.g., images, documents, PDFs)
   - Use file magic numbers for content-type verification (not just extension)
2. **File Size Limits**:
   - Enforce 100MB limit on both client and server
   - Reject files exceeding limit early in the request
3. **File Naming**:
   - Generate unique, random filenames for storage (preserve original filename in metadata)
   - Never use user-provided filename for storage paths
4. **Content Scanning**:
   - Integrate with antivirus scanning (e.g., ClamAV) for uploads
   - Scan files after upload before making them available
5. **Storage Security**:
   - Store files outside web root or in secure cloud storage (S3 with private ACL)
   - Use secure bucket policies (no public read unless explicitly shared)
   - Enable versioning and lifecycle policies in S3
   - Consider server-side encryption (SSE-S3 or SSE-KMS)
6. **Path Traversal Prevention**:
   - Sanitize file paths
   - Use whitelist-based validation for any user input in file paths
7. **Malware Prevention**:
   - Implement content disarm and reconstruction (CDR) for high-risk file types if needed
   - Consider sandboxing for file processing

### API Security (Azure API Design Best Practices)
1. **Authentication & Authorization**:
   - Use JWT with short expiration (15-30 min) and refresh token mechanism
   - Hash passwords with bcrypt (cost factor 12+)
   - Implement proper role-based access control (users can only access their own files)
   - For public files, use unguessable share tokens with optional expiration
2. **Input Validation**:
   - Validate all inputs (query params, headers, body) using schema validation
   - Reject requests with invalid content types
   - Implement strict JSON schema validation for request bodies
3. **Error Handling**:
   - Return appropriate HTTP status codes (4xx for client errors, 5xx for server errors)
   - Avoid leaking stack traces or internal details in error messages
   - Log errors internally for debugging
4. **Rate Limiting & Throttling**:
   - Implement rate limiting per IP and per user (e.g., 100 requests/hour)
   - Stricter limits on authentication and upload endpoints
5. **Secure Communication**:
   - Enforce HTTPS only (HSTS)
   - Use secure cookies for token storage (HttpOnly, Secure, SameSite)
   - Implement CSP headers to prevent XSS
6. **Dependencies & Updates**:
   - Regularly update dependencies
   - Use tools like npm audit or Snyk to scan for vulnerabilities
7. **Audit Logging**:
   - Log file uploads, downloads, deletions, and permission changes
   - Include user ID, timestamp, IP address, and file identifier

## Implementation Plan (Phased Approach)

### Phase 1: Project Setup & Core Infrastructure
1. Initialize repository with backend and frontend directories
2. Set up PostgreSQL database (local/docker for development)
3. Configure Express.js server with basic middleware (cors, helmet, json, rate limiting)
4. Set up AWS S3 configuration and create bucket
5. Implement user registration and login with JWT authentication
6. Create database connection layer (using pg or Sequelize)
7. Basic health check endpoint

### Phase 2: File Upload & Storage
1. Implement Multer middleware for handling multipart/form-data
2. Add file validation (size, MIME type, extension whitelist)
3. Integrate AWS S3 upload with unique key generation
4. Store file metadata in PostgreSQL (including S3 key, size, type, public flag)
5. Create file upload endpoint with progress tracking (using frontend)
6. Implement file download endpoint (streaming from S3)

### Phase 3: File Management & Sharing
1. Implement file listing endpoint (user's private files)
2. Add toggle public/private endpoint
3. Generate shareable tokens for public files (with optional expiration)
4. Create public access endpoint using share tokens
5. Implement file deletion (including S3 object removal)
6. Add file metadata update (rename, description if needed)

### Phase 4: Security Hardening
1. Implement antivirus scanning (ClamAV) for uploads (optional but recommended)
2. Add comprehensive input validation (Joi/Yup schemas)
3. Enhance error handling and logging
4. Implement security headers (Helmet configuration)
5. Add CORS policies restricted to frontend domain
6. Implement request size limits (for uploads)
7. Add brute-force protection on auth endpoints

### Phase 5: Frontend Development
1. Set up Next.js project with TypeScript
2. Create authentication context (login/register pages)
3. Build dashboard with file grid/list view
4. Implement file upload component with progress bar and drag-and-drop
5. Add file actions (download, delete, toggle public/private)
6. Create public file sharing modal with copyable link
7. Implement responsive design and loading states
8. Add client-side validation and user feedback

### Phase 6: Testing & Deployment
1. Write unit tests for backend services (Jest/Mocha)
2. Create integration tests for API endpoints (Supertest)
3. Implement end-to-end tests (Cypress or Playwright)
4. Set up CI/CD pipeline (GitHub Actions)
5. Create Docker containers for backend and frontend
6. Deploy to staging environment
7. Perform security audit and penetration testing
8. Deploy to production with monitoring

## Deployment Instructions
### Prerequisites
- Node.js >= 18.x
- PostgreSQL >= 13
- AWS account with S3 access
- Docker (for containerized deployment)
- Git

### Local Development Setup
1. Clone repository
2. Copy `.env.example` to `.env` and fill in variables:
   ```
   # Server
   PORT=5000
   NODE_ENV=development
   JWT_SECRET=your_jwt_secret_here
   JWT_EXPIRES_IN=15m
   
   # Database
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=filestorage
   DB_USER=postgres
   DB_PASSWORD=your_password
   
   # AWS S3
   AWS_ACCESS_KEY_ID=your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key
   AWS_REGION=us-east-1
   S3_BUCKET_NAME=your-file-storage-bucket
   
   # Cloudinary (optional for image processing)
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   
   # File Upload
   MAX_FILE_SIZE=104857600  # 100MB in bytes
   ```
3. Install dependencies: `npm install` (in both backend and frontend directories if split)
4. Run database migrations: `npm run db:migrate`
5. Start development servers:
   - Backend: `npm run dev` (backend directory)
   - Frontend: `npm run dev` (frontend directory)

### Production Deployment
1. Build Docker images:
   ```bash
   # Backend
   docker build -t filestorage-backend ./backend
   # Frontend
   docker build -t filestorage-frontend ./frontend
   ```
2. Push images to container registry
3. Deploy using orchestration platform (ECS, Kubernetes, or Vercel for full-stack)
4. Set environment variables in production environment
5. Configure domain and SSL certificates
6. Set up monitoring and logging (CloudWatch, ELK stack, etc.)

## Testing Strategy
### Unit Tests
- Test authentication utilities (JWT generation/validation)
- Test password hashing and comparison
- Test file validation functions
- Test database query helpers
- Test API controllers with mocked dependencies

### Integration Tests
- Test API endpoints with supertest
- Test database interactions
- Test S3 integration (using mocks or localstack)
- Test file upload/download flow

### End-to-End Tests
- Test user registration, login, file upload, sharing, and deletion
- Test public file access without authentication
- Test private file access protection
- Test file size limits and validation errors

### Security Tests
- OWASP ZAP scanning
- Manual penetration testing for common vulnerabilities
- File upload vulnerability testing (try to upload malicious files)
- JWT token manipulation tests

## Future Enhancements
1. **Advanced Features**:
   - File versioning and history
   - Folder/directory organization
   - File preview thumbnails (especially for images, PDFs)
   - Search functionality (by filename, metadata)
   - Activity feed and notifications
   - Trash/recycle bin with restore functionality
   - Bulk operations (download multiple files as zip)
   - File comments and collaboration
2. **Performance Improvements**:
   - CDN integration for public files (CloudFront)
   - Database read replicas for scaling
   - Caching frequently accessed files
   - Background processing for virus scanning/thumbnails
   - Pagination for file listings
3. **Additional Security**:
   - Two-factor authentication
   - Session management with refresh token rotation
   - IP-based access controls
   - File expiration and auto-delete policies
   - Integration with DLP (Data Loss Prevention) tools
   - Encryption at rest with customer-managed keys (SSE-KMS)
4. **Platform Expansion**:
   - Mobile applications (React Native)
   - Desktop client (Electron)
   - API rate limiting tiers
   - Admin dashboard for monitoring and user management
   - Integration with third-party services (Slack, email notifications)

---
*Document last updated: 2026-08-14*