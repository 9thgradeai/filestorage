import Joi from 'joi';

const emailSchema = Joi.string().email({ tlds: { allow: false } }).required();
// OWASP-aligned password policy: min 8 chars, mixed case, number, special char.
const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/[a-z]/, 'lowercase')
  .pattern(/[A-Z]/, 'uppercase')
  .pattern(/[0-9]/, 'number')
  .pattern(/[^A-Za-z0-9]/, 'special')
  .required();

const nameSchema = Joi.string()
  .trim()
  .min(2)
  .max(100)
  .pattern(/^[^<>&'"]+$/, 'safe-chars')
  .required();

const otpSchema = Joi.string()
  .pattern(/^\d{6}$/, '6-digit')
  .required();

const purposeSchema = Joi.string().valid('email_verification', 'password_reset').required();

export const validateRegistration = (data: {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}) =>
  Joi.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: Joi.string().required().valid(Joi.ref('password')),
  })
    .with('name', 'email')
    .with('email', 'password')
    .with('password', 'confirmPassword')
    .validate(data, { abortEarly: false });

export const validateLogin = (data: { email?: string; password?: string }) =>
  Joi.object({
    email: emailSchema,
    password: Joi.string().required(),
  }).validate(data, { abortEarly: false });

export const validateVerifyEmail = (data: { email?: string; otp?: string }) =>
  Joi.object({
    email: emailSchema,
    otp: otpSchema,
  }).validate(data, { abortEarly: false });

export const validateResendOtp = (data: { email?: string; purpose?: string }) =>
  Joi.object({
    email: emailSchema,
    purpose: purposeSchema,
  }).validate(data, { abortEarly: false });

export const validateForgotPassword = (data: { email?: string }) =>
  Joi.object({
    email: emailSchema,
  }).validate(data, { abortEarly: false });

export const validateResetPassword = (data: {
  email?: string;
  otp?: string;
  password?: string;
  confirmPassword?: string;
}) =>
  Joi.object({
    email: emailSchema,
    otp: otpSchema,
    password: passwordSchema,
    confirmPassword: Joi.string().required().valid(Joi.ref('password')),
  })
    .with('password', 'confirmPassword')
    .validate(data, { abortEarly: false });

export const validateTogglePublic = (data: { is_public?: unknown }) =>
  Joi.object({
    is_public: Joi.boolean().required(),
  }).validate(data, { abortEarly: false });

const folderNameSchema = Joi.string()
  .trim()
  .min(1)
  .max(255)
  .pattern(/[^\u0000-\u001f]/)
  .required();

const nullableFolderId = Joi.number().integer().min(1).allow(null);

export const validateCreateFolder = (data: { name?: string; parent_id?: unknown }) =>
  Joi.object({
    name: folderNameSchema,
    parent_id: nullableFolderId.optional().default(null),
  }).validate(data, { abortEarly: false });

export const validateUpdateFolder = (data: { name?: string; parent_id?: unknown }) =>
  Joi.object({
    name: folderNameSchema.optional(),
    parent_id: nullableFolderId.optional(),
  }).validate(data, { abortEarly: false });

const fileNameSchema = Joi.string().trim().min(1).max(255).required();

export const validateUpdateFile = (data: { original_filename?: string; parent_id?: unknown }) =>
  Joi.object({
    original_filename: fileNameSchema.optional(),
    parent_id: nullableFolderId.optional(),
  }).validate(data, { abortEarly: false });

export const validateStarFile = (data: { starred?: unknown }) =>
  Joi.object({
    starred: Joi.boolean().required(),
  }).validate(data, { abortEarly: false });