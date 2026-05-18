import { redirect } from 'next/navigation'
import { isRegistrationDisabled } from '@/lib/registration'
import { RegisterForm } from './RegisterForm'

export const dynamic = 'force-dynamic'

export default function RegisterPage() {
  if (isRegistrationDisabled()) {
    redirect('/login?registration=closed')
  }
  return <RegisterForm />
}
