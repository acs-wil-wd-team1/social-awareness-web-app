import { useEffect, useRef, useState } from 'react'
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
  const [validationAnnouncement, setValidationAnnouncement] = useState('')
  const form = useRef(null)
  const focusError = useRef(false)
  const inFlight = useRef(false)

  useEffect(() => {
    if (focusError.current && !isSubmitting) {
      form.current?.querySelector('[aria-invalid="true"]')?.focus()
      focusError.current = false
    }
  }, [errors, isSubmitting])

  function validateField(name, value, values = formValues) {
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

    if (name === 'password' && Array.from(value).length < 6) {
      return 'Use at least 6 characters. A longer passphrase is easier to remember.'
    }

    if (name === 'password' && new TextEncoder().encode(value).length > 72) {
      return 'Use a password of 72 UTF-8 bytes or fewer. Emoji and some characters use more than one byte.'
    }

    if (name === 'confirmPassword' && value !== values.password) {
      return 'Passwords do not match.'
    }

    return ''
  }

  function handleChange(event) {
    if (inFlight.current) return
    const { name, value } = event.target
    const nextValues = {
      ...formValues,
      [name]: value,
    }

    setFormValues(nextValues)
    setIsSubmitted(false)
    setApiError('')
    setValidationAnnouncement('')

    setErrors(current => ({
      ...current,
      ...(current[name] ? { [name]: validateField(name, value, nextValues) } : {}),
      ...(name === 'password' && current.confirmPassword ? { confirmPassword: validateField('confirmPassword', nextValues.confirmPassword, nextValues) } : {}),
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (inFlight.current) return

    const nextErrors = {
      name: validateField('name', formValues.name),
      email: validateField('email', formValues.email),
      password: validateField('password', formValues.password),
      confirmPassword: validateField('confirmPassword', formValues.confirmPassword),
    }

    setErrors(nextErrors)
    setIsSubmitted(false)
    setApiError('')
    setValidationAnnouncement('')

    if (Object.values(nextErrors).some(Boolean)) {
      focusError.current = true
      setValidationAnnouncement('Please correct the highlighted fields before registering.')
      return
    }

    inFlight.current = true
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
      const fields = Object.fromEntries(Object.entries(error.fieldErrors || {}).filter(([name]) => Object.hasOwn(initialValues, name)))
      setErrors(current => ({ ...current, ...fields }))
      focusError.current = Object.keys(fields).length > 0
      setApiError(error.message || 'The registration service could not be reached.')
    } finally {
      inFlight.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-page content-width" aria-labelledby="register-title">
      <div className="auth-card">
        <h1 id="register-title">Create your account</h1>

        <form ref={form} onSubmit={handleSubmit} noValidate>
          <p className="visually-hidden" aria-live="polite" aria-atomic="true">{validationAnnouncement}</p>
          <div className="auth-field">
            <label htmlFor="register-type">Account type</label>
            <select id="register-type" name="accountType" value={formValues.accountType} onChange={handleChange} disabled={isSubmitting} aria-invalid={Boolean(errors.accountType)} aria-describedby={errors.accountType ? 'register-type-error' : undefined}>
              <option value="user">Community member</option>
              <option value="business">Small business owner</option>
            </select>
            {errors.accountType ? <p id="register-type-error" className="auth-field__error">{errors.accountType}</p> : null}
          </div>
          <div className="auth-field">
            <label htmlFor="register-name">Name</label>
            <input
              id="register-name"
              name="name"
              type="text"
              disabled={isSubmitting}
              maxLength={100}
              autoComplete="name"
              value={formValues.name}
              onChange={handleChange}
              placeholder="e.g. Kim Gesite"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? 'register-name-error' : undefined}
            />
            {errors.name ? <p id="register-name-error" className="auth-field__error">{errors.name}</p> : null}
          </div>

          <div className="auth-field">
            <label htmlFor="register-email">Email</label>
            <input
              id="register-email"
              name="email"
              type="email"
              disabled={isSubmitting}
              maxLength={150}
              autoComplete="email"
              value={formValues.email}
              onChange={handleChange}
              placeholder="e.g. kim@example.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'register-email-error' : undefined}
            />
            {errors.email ? <p id="register-email-error" className="auth-field__error">{errors.email}</p> : null}
          </div>

          <div className="auth-field">
            <label htmlFor="register-password">Password</label>
            <input
              id="register-password"
              name="password"
              type="password"
              disabled={isSubmitting}
              autoComplete="new-password"
              value={formValues.password}
              onChange={handleChange}
              placeholder="Password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={`register-password-help${errors.password ? ' register-password-error' : ''}`}
            />
            <p id="register-password-help" className="auth-form__help">Use at least 6 characters, up to 72 UTF-8 bytes. Longer passwords are safer. Emoji and some characters use more than one byte.</p>
            {errors.password ? <p id="register-password-error" className="auth-field__error">{errors.password}</p> : null}
          </div>

          <div className="auth-field">
            <label htmlFor="register-confirm-password">Confirm password</label>
            <input
              id="register-confirm-password"
              name="confirmPassword"
              type="password"
              disabled={isSubmitting}
              autoComplete="new-password"
              value={formValues.confirmPassword}
              onChange={handleChange}
              placeholder="Confirm password"
              aria-invalid={Boolean(errors.confirmPassword)}
              aria-describedby={errors.confirmPassword ? 'register-confirm-password-error' : undefined}
            />
            {errors.confirmPassword ? <p id="register-confirm-password-error" className="auth-field__error">{errors.confirmPassword}</p> : null}
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
