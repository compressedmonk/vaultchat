interface AuthCardProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
}

export default function AuthCard({ children, title, subtitle }: AuthCardProps) {
  return (
    <div className="app-card max-w-md w-full mx-auto">
      {title && (
        <div className="mb-6">
          <h1 className="text-2xl font-semibold app-heading mb-1">{title}</h1>
          {subtitle && <p className="text-sm app-muted">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}
