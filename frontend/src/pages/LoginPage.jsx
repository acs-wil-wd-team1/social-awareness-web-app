import { useState } from 'react'

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
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formValues.email,
          password: formValues.password,
        }),
      })

      const body = await response.json().catch(() => null)

      if (!response.ok) {
        setErrors((currentErrors) => ({
          ...currentErrors,
          ...(body?.fieldErrors ?? {}),
        }))

        setApiError(body?.message ?? 'Login failed. Please try again.')
        return
      }

      if (!body?.token) {
        setApiError('Login succeeded, but no authentication token was returned.')
        return
      }

      localStorage.setItem('token', body.token)

      window.location.href = '/'
    } catch {
      setApiError('The login service could not be reached.')
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
