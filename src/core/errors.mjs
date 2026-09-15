/** Error taxonomy — each failure mode carries enough context to be repaired automatically. */

export class ArtisanError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = new.target.name;
    this.code = options.code ?? 'ARTISAN_ERROR';
    this.details = options.details ?? {};
    this.recoverable = options.recoverable ?? false;
    this.hint = options.hint ?? undefined;
    this.cause = options.cause;
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      hint: this.hint,
      details: this.details,
    };
  }
}

export class ConfigError extends ArtisanError {
  constructor(message, options = {}) {
    super(message, { code: 'CONFIG_ERROR', ...options });
  }
}

export class WorkspaceError extends ArtisanError {
  constructor(message, options = {}) {
    super(message, { code: 'WORKSPACE_ERROR', ...options });
  }
}

export class SkillError extends ArtisanError {
  constructor(message, options = {}) {
    super(message, { code: 'SKILL_ERROR', ...options });
  }
}

export class ToolError extends ArtisanError {
  constructor(message, options = {}) {
    super(message, { code: 'TOOL_ERROR', recoverable: true, ...options });
  }
}

export class ModelError extends ArtisanError {
  constructor(message, options = {}) {
    super(message, { code: 'MODEL_ERROR', recoverable: true, ...options });
  }
}

export class PlanError extends ArtisanError {
  constructor(message, options = {}) {
    super(message, { code: 'PLAN_ERROR', ...options });
  }
}

export class VerificationError extends ArtisanError {
  constructor(message, options = {}) {
    super(message, { code: 'VERIFICATION_ERROR', ...options });
  }
}

/** Wraps unknown throws so the runtime never crashes on a stray string. */
export function toError(value) {
  if (value instanceof Error) return value;
  return new ArtisanError(typeof value === 'string' ? value : JSON.stringify(value));
}

export function isRecoverable(error) {
  return Boolean(error?.recoverable);
}
