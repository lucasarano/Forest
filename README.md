# Forest - AI-Powered Learning Platform

A dark, minimalistic React web app with an Obsidian-inspired design. Forest features beautiful authentication pages and an animated knowledge graph background that creates a mesmerizing visual experience.

## Features

- 🌲 **Dark Minimalistic Design** - Obsidian-inspired dark theme with emerald and teal accents
- 🧠 **Animated Knowledge Graph** - Dynamic canvas-based background with connected nodes
- 🔐 **Authentication Pages** - Beautiful login and signup pages with form validation
- ⚡ **Fast & Responsive** - Built with Vite and React for optimal performance
- 🎨 **Smooth Animations** - Powered by Framer Motion for delightful interactions
- 📱 **Mobile Friendly** - Fully responsive design that works on all devices
- ✨ **Modern UX** - Password strength indicator, form validation, and smooth transitions

## Tech Stack

- **React 18** - UI library with hooks
- **React Router** - Client-side routing
- **Vite** - Lightning-fast build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Framer Motion** - Animation library
- **Lucide React** - Beautiful icon set
- **Canvas API** - For knowledge graph visualization

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

## Project Structure

```
Forest/
├── src/
│   ├── components/
│   │   ├── KnowledgeGraph.jsx # Animated graph background
│   │   ├── Logo.jsx           # Forest logo component
│   │   ├── Button.jsx         # Reusable button component
│   │   └── Input.jsx          # Reusable input component
│   ├── pages/
│   │   ├── Login.jsx          # Login page
│   │   ├── Signup.jsx         # Signup page with password strength
│   │   └── Dashboard.jsx      # Main dashboard
│   ├── App.jsx                # Root component with routing
│   ├── main.jsx              # Entry point
│   └── index.css             # Global styles
├── public/
│   └── forest-icon.svg       # App favicon
├── index.html                # HTML template
├── package.json              # Dependencies
├── vite.config.js           # Vite configuration
├── tailwind.config.js       # Tailwind configuration
└── postcss.config.js        # PostCSS configuration
```

## Color Palette

The dark, minimalistic color scheme in `tailwind.config.js`:

```js
colors: {
  'forest-dark': '#0a0f0d',        // Main background
  'forest-darker': '#050807',       // Darker sections
  'forest-card': '#141b17',         // Card backgrounds
  'forest-border': '#1f2d27',       // Borders
  'forest-green': '#10b981',        // Accent green
  'forest-emerald': '#34d399',      // Primary accent
  'forest-teal': '#14b8a6',         // Secondary accent
  'forest-gray': '#6b7280',         // Muted text
  'forest-light-gray': '#9ca3af',   // Light text
}
```

## Features Details

### Knowledge Graph
- Canvas-based animated visualization
- 50 interconnected nodes
- Dynamic connections based on distance
- Smooth particle movement
- Adjustable opacity for different contexts

### Authentication
- **Login Page**: Email/password with remember me and forgot password
- **Signup Page**: Full name, email, password with strength indicator
- Form validation with helpful error messages
- Smooth transitions and micro-interactions

### Dashboard
- Learning statistics cards
- Course progress tracking
- Recent activity
- AI-powered recommendations
- Knowledge graph visualization

## Future Development

- Backend API integration
- Real authentication with JWT
- User profile management
- Course content and lessons
- Interactive knowledge graph navigation
- AI-powered learning recommendations
- Progress tracking and analytics
- Social features and collaboration

## License

See LICENSE file for details.
