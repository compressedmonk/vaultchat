import { ButtonHTMLAttributes, forwardRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', children, ...props }, ref) => {
    const baseClasses = 'rounded-lg font-semibold transition-all focus:outline-none disabled:opacity-50'
    const variantClasses = {
      primary: 'app-btn-primary',
      secondary: 'rounded-lg border px-4 py-2 text-sm font-semibold bg-white text-gray-900 border-gray-300 hover:bg-gray-50',
      ghost: 'rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100',
    }
    const sizeClasses = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-5 py-3 text-base',
    }
    return (
      <button
        ref={ref}
        className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    )
  }
)
Button.displayName = 'Button'

export default Button
