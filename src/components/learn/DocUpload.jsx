import React, { useRef, useState } from 'react'
import { FileText, Loader, Upload, X } from 'lucide-react'
import { uploadDocument } from '../../lib/api'

const DocUpload = ({ token, onUploadComplete, disabled = false }) => {
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const inputRef = useRef(null)
  const errorTimerRef = useRef(null)

  const flashError = (message) => {
    setErrorMessage(message)
    if (errorTimerRef.current) window.clearTimeout(errorTimerRef.current)
    errorTimerRef.current = window.setTimeout(() => setErrorMessage(''), 5000)
  }

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !token || uploading) return

    setUploading(true)
    setErrorMessage('')
    try {
      const result = await uploadDocument({ token, file })
      setUploadedFiles((prev) => [...prev, result.document])
      onUploadComplete?.(result)
    } catch (err) {
      console.error('Upload error:', err)
      flashError(err?.message || 'Upload failed. Try again.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const removeFile = (docId) => {
    setUploadedFiles((prev) => prev.filter((d) => d.id !== docId))
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.pdf"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || uploading}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        className="px-3 py-2 rounded-xl text-xs border border-forest-border bg-forest-card text-forest-light-gray hover:text-forest-emerald hover:border-forest-emerald/50 transition-colors disabled:opacity-50 flex items-center gap-1.5"
        title="Upload reference document (TXT, PDF)"
      >
        {uploading ? <Loader size={13} className="animate-spin" /> : <Upload size={13} />}
        Doc
      </button>

      {uploadedFiles.map((doc) => (
        <span key={doc.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-forest-emerald/10 border border-forest-emerald/30 text-xs text-forest-emerald">
          <FileText size={12} />
          <span className="max-w-[80px] truncate">{doc.filename}</span>
          <button type="button" onClick={() => removeFile(doc.id)} className="hover:text-white transition-colors">
            <X size={11} />
          </button>
        </span>
      ))}

      {errorMessage && (
        <span role="alert" className="px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-xs text-red-200">
          {errorMessage}
        </span>
      )}
    </div>
  )
}

export default DocUpload
