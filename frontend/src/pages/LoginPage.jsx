import { useState } from 'react'
import { apiRequest } from '../services/apiClient.js'
import { safeReturnPath, storeSession } from '../services/authSession.js'

const initialValues = {
  email: '',
  password: '',
}

export default function LoginPage() {
  const [formValues, setFormValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState('')

  function validateField(name, value) {
    if (!value.trim()) {
      return 'This field is required.'
    }

    if (
      name === 'email' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ) {
      return 'Please enter a valid email address.'
    }

    return ''
  }

  function handleChange(event) {
    const { name, value } = event.target

    const nextValues = {
      ...formValues,
      [name]: value,
    }

    setFormValues(nextValues)
    setApiError('')

    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: validateField(name, value),
      })
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const nextErrors = {
      email: validateField('email', formValues.email),
      password: validateField('password', formValues.password),
    }

    setErrors(nextErrors)
    setApiError('')

    if (Object.values(nextErrors).some(Boolean)) {
      return
    }

    setIsSubmitting(true)

    try {
      const body = await apiRequest('/api/auth/login', {
        method: 'POST',
        expectedStatus: 200,
        body: {
          email: formValues.email.trim(),
          password: formValues.password,
        },
      })

      if (typeof body?.token !== 'string' || !body.token.trim() || !Number.isSafeInteger(body.user?.id) || body.user.id <= 0 || !['public', 'business_owner', 'admin'].includes(body.user?.role)) {
        setApiError('The server did not return a valid login session. Please try again.')
        return
      }

      storeSession(body.token, body.user)
      window.location.href = safeReturnPath(new URLSearchParams(window.location.search).get('returnTo'))
    } catch (error) {
      setErrors(current => ({ ...current, ...error.fieldErrors }))
      setApiError(error.message || 'The login service could not be reached.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-page content-width" aria-labelledby="login-title">
      <div className="auth-card">
        <h1 id="login-title">Login</h1>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="username"
              value={formValues.email}
              onChange={handleChange}
              placeholder="e.g. kim@example.com"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email ? (
              <p className="auth-field__error">{errors.email}</p>
            ) : null}
          </div>

          <div className="auth-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={formValues.password}
              onChange={handleChange}
              placeholder="Password"
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password ? (
              <p className="auth-field__error">{errors.password}</p>
            ) : null}
          </div>

          <button className="auth-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Logging in...' : 'Login'}
          </button>

          {apiError ? (
            <p className="auth-field__error" role="alert">
              {apiError}
            </p>
          ) : null}
        </form>

        <p className="auth-switch">
          <a href="/register">
            Don't have an account? Register
          </a>
        </p>
      </div>
    </section>
  )
}
