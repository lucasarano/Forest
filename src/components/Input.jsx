import React from 'react'

const Input = ({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  error = '',
  icon: Icon
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-forest-light-gray mb-2">
          {label}
          {required && <span className="text-forest-emerald ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-forest-gray">
            <Icon size={20} />
          </div>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          className={`w-full ${Icon ? 'pl-12' : 'pl-4'} pr-4 py-3 bg-forest-card border ${error ? 'border-red-500' : 'border-forest-border'
            } rounded-lg text-white placeholder-forest-gray focus:outline-none focus:border-forest-emerald focus:ring-1 focus:ring-forest-emerald transition-colors`}
        />
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-400">{error}</p>
      )}
    </div>
  )
}

export default Input
