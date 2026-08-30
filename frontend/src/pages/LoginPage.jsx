import { useState } from 'react'

const initialValues = {
  email: '',
  password: '',
}

export default function LoginPage() {
  const [formValues, setFormValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [isSubmitted, setIsSubmitted] = useState(false)

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

    if (errors[name]) {
      setErrors({
        ...errors,
        [name]: validateField(name, value),
      })
    }
  }

  function handleSubmit(event) {
    event.preventDefault()

    const nextErrors = {
      email: validateField('email', formValues.email),
      password: validateField('password', formValues.password),
    }

    setErrors(nextErrors)
    setIsSubmitted(true)

    if (Object.values(nextErrors).some(Boolean)) {
      return
    }
    localStorage.setItem('isLoggedIn', 'true')
    window.location.href = '/' //to redirect it to home page
    //alert('Frontend-only login preview: this form is not connected to an API yet.')
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

          <button className="auth-button" type="submit">
            Login
          </button>

          {isSubmitted && !Object.values(errors).some(Boolean) ? (
            <p className="auth-form__status" role="status">
              Login form validated successfully.
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

