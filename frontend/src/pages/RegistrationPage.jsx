import { useState } from 'react'

const initialValues = {
  name: '',
  email: '',
  password: '',
  confirmPassword: '',
}

export default function RegistrationPage() {
  const [formValues, setFormValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [isSubmitted, setIsSubmitted] = useState(false)

  function validateField(name, value) {
    if (!value.trim()) {
      return 'This field is required.'
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
      name: validateField('name', formValues.name),
      email: validateField('email', formValues.email),
      password: validateField('password', formValues.password),
      confirmPassword: validateField('confirmPassword', formValues.confirmPassword),
    }

    setErrors(nextErrors)
    setIsSubmitted(true)

    if (Object.values(nextErrors).some(Boolean)) {
      return
    }

    alert('Frontend-only registration preview: this form is not connected to an API yet.')
  }

  return (
    <section className="auth-page content-width" aria-labelledby="register-title">
      <div className="auth-card">
        <h1 id="register-title">Create your account</h1>

        <form onSubmit={handleSubmit} noValidate>
          <div className="auth-field">
            <label htmlFor="register-name">Name</label>
            <input
              id="register-name"
              name="name"
              type="text"
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

          <button className="auth-button" type="submit">Register</button>

          {isSubmitted && !Object.values(errors).some(Boolean) ? (
            <p className="auth-form__status" role="status">Registration form validated successfully.</p>
          ) : null}
        </form>

        <p className="auth-switch">
          <a href="/login">Already have an account? Login</a>
        </p>
      </div>
    </section>
  )
}
