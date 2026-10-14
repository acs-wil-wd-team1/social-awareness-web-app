import { useEffect, useRef, useState } from 'react'
import { apiRequest } from '../services/apiClient.js'
import { authPagePath, dismissSessionStorageFailure, getSession, safeReturnPath, SESSION_STORAGE_FAILURE_CODE, storeSession } from '../services/authSession.js'

const initialValues = {
  email: '',
  password: '',
}

export default function LoginPage({ storageFailureFeedbackOwnedByShell = false }) {
  const returnTo = safeReturnPath(new URLSearchParams(window.location.search).get('returnTo'))
  const [formValues, setFormValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [apiError, setApiError] = useState('')
  const [validationAnnouncement, setValidationAnnouncement] = useState('')
  const form = useRef(null)
  const focusError = useRef(false)
  const mounted = useRef(false)
  const inFlight = useRef(false)
  const requestVersion = useRef(0)
  const request = useRef(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requestVersion.current += 1
      request.current?.abort()
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    if (focusError.current && !isSubmitting) {
      form.current?.querySelector('[aria-invalid="true"]')?.focus()
      focusError.current = false
    }
  }, [errors, isSubmitting])

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
    setValidationAnnouncement('')

    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: validateField(name, value),
      })
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (inFlight.current || !mounted.current) return
    dismissSessionStorageFailure()

    const nextErrors = {
      email: validateField('email', formValues.email),
      password: validateField('password', formValues.password),
    }

    setErrors(nextErrors)
    setApiError('')
    setValidationAnnouncement('')

    if (Object.values(nextErrors).some(Boolean)) {
      focusError.current = true
      setValidationAnnouncement('Please correct the highlighted fields before logging in.')
      return
    }

    inFlight.current = true
    setIsSubmitting(true)
    const version = ++requestVersion.current
    const previousToken = getSession().token
    const controller = new AbortController()
    request.current = controller
    const isCurrent = () => mounted.current && version === requestVersion.current
      && !controller.signal.aborted && getSession().token === previousToken

    try {
      const body = await apiRequest('/api/auth/login', {
        method: 'POST',
        expectedStatus: 200,
        signal: controller.signal,
        body: {
          email: formValues.email.trim(),
          password: formValues.password,
        },
      })
      if (!isCurrent()) return

      if (typeof body?.token !== 'string' || !body.token.trim() || !Number.isSafeInteger(body.user?.id) || body.user.id <= 0 || !['public', 'business_owner', 'admin'].includes(body.user?.role)) {
        setApiError('The server did not return a valid login session. Please try again.')
        return
      }

      // Check before storing: the normal session event can remount this page.
      // Keep storing and redirecting synchronous once this request is accepted.
      storeSession(body.token, body.user)
      window.location.href = returnTo
    } catch (error) {
      if (!isCurrent() || error.code === 'ABORTED') return
      // The shell retains this notice across session remounts and owns dismissal.
      // Keeping a second form error would make a dismissed notice reappear.
      if (storageFailureFeedbackOwnedByShell && error.code === SESSION_STORAGE_FAILURE_CODE) return
      const fields = Object.fromEntries(Object.entries(error.fieldErrors || {}).filter(([name]) => Object.hasOwn(initialValues, name)))
      setErrors(current => ({ ...current, ...fields }))
      focusError.current = Object.keys(fields).length > 0
      setApiError(error.message || 'The login service could not be reached.')
    } finally {
      if (mounted.current && version === requestVersion.current) {
        inFlight.current = false
        request.current = null
        setIsSubmitting(false)
      }
    }
  }

  return (
    <section className="auth-page content-width" aria-labelledby="login-title">
      <div className="auth-card">
        <h1 id="login-title">Login</h1>

        <form ref={form} onSubmit={handleSubmit} noValidate>
          <p className="visually-hidden" aria-live="polite" aria-atomic="true">{validationAnnouncement}</p>
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
              aria-describedby={errors.email ? 'login-email-error' : undefined}
            />
            {errors.email ? (
              <p id="login-email-error" className="auth-field__error">{errors.email}</p>
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
              aria-describedby={errors.password ? 'login-password-error' : undefined}
            />
            {errors.password ? (
              <p id="login-password-error" className="auth-field__error">{errors.password}</p>
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
          <a href={authPagePath('/register', returnTo)}>
            Don't have an account? Register
          </a>
        </p>
      </div>
    </section>
  )
}
