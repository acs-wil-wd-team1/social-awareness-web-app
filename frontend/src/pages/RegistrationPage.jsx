import { useState } from 'react'
import { apiRequest, ApiError } from '../services/apiClient.js'
import { authPagePath } from '../services/authSession.js'

const initialValues = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
  accountType: 'user',
}

export default function RegistrationPage() {
  const loginPath = authPagePath('/login', new URLSearchParams(window.location.search).get('returnTo'))
  const [formValues, setFormValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [apiError, setApiError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function validateField(name, value) {
    if (!value.trim()) {
      return 'This field is required.'
    }

    if (name === 'name' && value.trim().length > 100) {
      return 'Use 100 characters or fewer.'
    }

    if (name === 'email' && value.trim().length > 150) {
      return 'Use 150 characters or fewer.'
    }

    if (name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
      return 'Please enter a valid email address.'
    }

    if (name === 'confirmPassword' && value !== formValues.password) {
      return 'Passwords do not match.'
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
    setIsSubmitted(false)
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
      name: validateField('name', formValues.name),
      email: validateField('email', formValues.email),
      password: validateField('password', formValues.password),
      confirmPassword: validateField('confirmPassword', formValues.confirmPassword),
    }

    setErrors(nextErrors)
    setIsSubmitted(false)
    setApiError('')

    if (Object.values(nextErrors).some(Boolean)) {
      return
    }

    setIsSubmitting(true)

    try {
      const body = await apiRequest('/api/auth/register', {
        method: 'POST',
        expectedStatus: 201,
        body: {
          name: formValues.name.trim(),
          email: formValues.email.trim(),
          password: formValues.password,
          accountType: formValues.accountType,
        },
      })
      const expectedRole = formValues.accountType === 'business' ? 'business_owner' : 'public'
      if (!Number.isSafeInteger(body?.user?.id) || body.user.id <= 0 || body.user?.role !== expectedRole) {
        throw new ApiError('The server did not confirm your account. Try logging in before registering again.', { code: 'INVALID_RESPONSE' })
      }

      setIsSubmitted(true)
    } catch (error) {
      setErrors(current => ({ ...current, ...error.fieldErrors }))
      setApiError(error.message || 'The registration service could not be reached.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-page content-width" aria-labelledby="register-title">
      <div className="auth-card">
        <h1 id="register-title">Create your account</h1>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="register-type">Account type</label>
            <select id="register-type" name="accountType" value={formValues.accountType} onChange={handleChange}>
              <option value="user">Community member</option>
              <option value="business">Small business owner</option>
            </select>
            {errors.accountType ? <p className="auth-field__error">{errors.accountType}</p> : null}
          </div>
          <div className="auth-field">
            <label htmlFor="register-name">Name</label>
            <input
              id="register-name"
              name="name"
              type="text"
              maxLength={100}
              value={formValues.name}
              onChange={handleChange}
              placeholder="e.g. Kim Gesite"
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? <p className="auth-field__error">{errors.name}</p> : null}
          </div>

          <div className="auth-field">
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              name="email"
              type="email"
              maxLength={150}
              value={formValues.email}
              onChange={handleChange}
              placeholder="e.g. kim@example.com"
              aria-invalid={Boolean(errors.email)}
            />
            {errors.email ? <p className="auth-field__error">{errors.email}</p> : null}
          </div>

          <div className="auth-field">
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              name="password"
              type="password"
              value={formValues.password}
              onChange={handleChange}
              placeholder="Password"
              aria-invalid={Boolean(errors.password)}
            />
            {errors.password ? <p className="auth-field__error">{errors.password}</p> : null}
          </div>

          <div className="auth-field">
            <label htmlFor="register-confirm-password">Confirm password</label>
            <input
              id="register-confirm-password"
              name="confirmPassword"
              type="password"
              value={formValues.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm password"
              aria-invalid={Boolean(errors.confirmPassword)}
            />
            {errors.confirmPassword ? <p className="auth-field__error">{errors.confirmPassword}</p> : null}
          </div>

          <button className="auth-button" type="submit" disabled={isSubmitting || isSubmitted}>
            {isSubmitting ? 'Registering...' : 'Register'}
          </button>

          {apiError ? <p className="auth-field__error" role="alert">{apiError}</p> : null}

          {isSubmitted && !Object.values(errors).some(Boolean) ? (
            <p className="auth-form__status" role="status">
              Registration successful. <a href={loginPath}>Continue to login</a>
            </p>
          ) : null}
        </form>

        <p className="auth-switch">
          <a href={loginPath}>Already have an account? Login</a>
        </p>
      </div>
    </section>
  )
}
