import { InputHTMLAttributes, forwardRef, useMemo, useState } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helperText?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', id, ...props }, ref) => {
    const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`
    const isPasswordType = props.type === 'password'
    const [showPassword, setShowPassword] = useState(false)
    const inputType = useMemo(() => {
      if (!isPasswordType) return props.type
      return showPassword ? 'text' : 'password'
    }, [isPasswordType, props.type, showPassword])

    return (
      <div>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium app-heading mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={`app-input ${isPasswordType ? 'pr-16' : ''} ${error ? 'border-red-300 focus:border-red-400 focus:shadow-red-100' : ''} ${className}`}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
            {...props}
            type={inputType}
          />
          {isPasswordType && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-100"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={`${inputId}-helper`} className="mt-1 text-xs app-muted">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

export default Input
