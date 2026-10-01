import { useEffect, useRef, useState } from 'react'

export function validateCampaignImage(file) {
  if (!file) return ''
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPG, PNG or WebP photo.'
  if (!file.size) return 'This photo is empty. Please choose another file.'
  if (file.size > 5000000) return 'Choose a photo smaller than or equal to 5 MB.'
  return ''
}

export default function CampaignImageInput({ file, onChange, error = '', onError, disabled = false }) {
  const [preview, setPreview] = useState('')
  const input = useRef(null)
  useEffect(() => {
    if (!file && input.current) input.current.value = ''
    if (!file || !URL.createObjectURL) { setPreview(''); return undefined }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function change(event) {
    const selected = event.target.files?.[0] || null
    if (!selected) return
    const message = validateCampaignImage(selected)
    onError?.(message)
    onChange(message ? null : selected)
    if (message) event.target.value = ''
  }

  return (
    <div className="campaign-form-field campaign-form-field--full campaign-photo-field">
      <label htmlFor="submission-image">Campaign photo <span>(optional)</span></label>
      <p id="submission-image-help" className="campaign-form-help">JPG, PNG or WebP, up to 5 MB. Your photo will appear with your campaign after approval.</p>
      <input ref={input} id="submission-image" name="imageId" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled}
        onChange={change} aria-invalid={Boolean(error)} aria-describedby={`submission-image-help${error ? ' submission-image-error' : ''}`} />
      {error ? <p id="submission-image-error" className="campaign-form-error">{error}</p> : null}
      {file || error ? (
        <div className="campaign-photo-preview">
          {preview ? <img src={preview} alt="Selected campaign photo preview" /> : null}
          <div>{file ? <p>{file.name}</p> : null}<button type="button" className="campaign-secondary-button" disabled={disabled} onClick={() => {
            onChange(null); onError?.(''); if (input.current) input.current.value = ''
          }}>Remove photo</button></div>
        </div>
      ) : null}
    </div>
  )
}
