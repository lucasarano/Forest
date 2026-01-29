import React from 'react'

const Input = ({
  label,
  type = 'text',
  name,
  value,
  onChange,
  placeholder,
  required = false,
  error = '',
  icon: Icon,
  autoComplete = 'off'
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
          <div className="absolute left-4 xl:left-5 top-1/2 transform -translate-y-1/2 text-forest-gray">
            <Icon className="xl:w-6 xl:h-6" size={20} />
          </div>
        )}
        <input
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          className={`w-full ${Icon ? 'pl-12 xl:pl-14' : 'pl-4'} pr-4 py-3 xl:py-4 text-base xl:text-lg bg-forest-card/80 backdrop-blur-sm border ${error ? 'border-red-500' : 'border-forest-border'
            } rounded-lg text-white placeholder-forest-gray focus:outline-none focus:border-forest-emerald focus:ring-2 focus:ring-forest-emerald/50 transition-all duration-100 relative z-10`}
        />
      </div>
      {error && (
        <p className="mt-1 text-sm text-red-400">{error}</p>
      )}
    </div>
  )
}

export default Input
