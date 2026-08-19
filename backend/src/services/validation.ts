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

export const validateRegistration = (data: { email?: string; password?: string }) =>
  Joi.object({
    email: emailSchema,
    password: passwordSchema,
  }).validate(data, { abortEarly: false });

export const validateTogglePublic = (data: { is_public?: unknown }) =>
  Joi.object({
    is_public: Joi.boolean().required(),
  }).validate(data, { abortEarly: false });
