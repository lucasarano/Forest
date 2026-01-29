# Forest - AI-Powered Learning Platform

A dark, minimalistic React web app with an Obsidian-inspired design. Forest features beautiful authentication pages and an animated knowledge graph background that creates a mesmerizing visual experience.

## Features

- 🌲 **Dark Minimalistic Design** - Obsidian-inspired dark theme with emerald and teal accents
- 🧠 **Animated Knowledge Graph** - Dynamic canvas-based background with connected nodes
- 🤖 **AI-Powered Learning Tree** - Interactive infinite canvas with OpenAI integration
- 🎯 **Selective Branching** - Create child concepts from selected text in AI responses
- 🌐 **Context Inheritance** - AI understands your full learning path
- 🔐 **Secure Authentication** - Supabase-powered login/signup with form validation
- 🏠 **Beautiful Home Page** - Hero section with feature showcase
- ⚡ **Fast & Responsive** - Built with Vite and React for optimal performance
- 🎨 **Smooth Animations** - Powered by Framer Motion for delightful interactions
- 📱 **Mobile Friendly** - Fully responsive design that works on all devices
- ✨ **Modern UX** - Password strength indicator, form validation, and smooth transitions
- 🔒 **Protected Routes** - Dashboard accessible only to authenticated users
- 💾 **Auto-Save** - Tree structure persists to localStorage

## Tech Stack

- **React 18** - UI library with hooks
- **React Router** - Client-side routing
- **Supabase** - Backend-as-a-Service for authentication and database
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

2. Set up environment variables:
   - Copy `.env.example` to `.env`
   - **Supabase** (for authentication):
     - Create project at [supabase.com](https://supabase.com)
     - Add credentials to `.env`
     - See `SUPABASE_SETUP.md` for details
   - **OpenAI** (for Learning Tree AI):
     - Get API key at [platform.openai.com](https://platform.openai.com)
     - Add `VITE_OPENAI_API_KEY` to `.env`
     - See `AI_INTEGRATION.md` for details

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:3000`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

## Project Structure

```
Forest/
├── src/
│   ├── components/
│   │   ├── KnowledgeGraph.jsx  # Animated graph background
│   │   ├── Logo.jsx            # Forest logo component
│   │   ├── Button.jsx          # Reusable button component
│   │   ├── Input.jsx           # Reusable input component
│   │   └── ProtectedRoute.jsx  # Auth route wrapper
│   ├── pages/
│   │   ├── Home.jsx            # Landing page
│   │   ├── Login.jsx           # Login page
│   │   ├── Signup.jsx          # Signup page with password strength
│   │   └── Dashboard.jsx       # Main dashboard
│   ├── context/
│   │   └── AuthContext.jsx     # Auth state management
│   ├── lib/
│   │   └── supabase.js         # Supabase client
│   ├── App.jsx                 # Root component with routing
│   ├── main.jsx               # Entry point
│   └── index.css              # Global styles
├── public/
│   └── forest-icon.svg        # App favicon
├── .env.example               # Environment variables template
├── SUPABASE_SETUP.md          # Supabase setup guide
├── index.html                 # HTML template
├── package.json               # Dependencies
├── vite.config.js            # Vite configuration
├── tailwind.config.js        # Tailwind configuration
└── postcss.config.js         # PostCSS configuration
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

## Documentation

- **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)** - Authentication setup guide
- **[AI_INTEGRATION.md](AI_INTEGRATION.md)** - AI-powered Learning Tree guide
- **[LEARNING_TREE.md](LEARNING_TREE.md)** - Interactive canvas features

## AI Learning Tree Features

The Learning Tree (`/tree`) is a powerful AI-integrated infinite canvas:

- **Contextual AI Tutor**: Ask questions and get responses that build on your learning path
- **Selective Branching**: Select text in AI responses to create focused child nodes
- **Heritage System**: AI remembers the full path from root to current concept
- **Visual Path**: Golden glow shows your learning journey from root to active node
- **Expansion Ideas**: AI suggests 3 related concepts to explore
- **Auto-Save**: Everything persists to localStorage
- **Infinite Canvas**: Pan, zoom, and organize your knowledge universe

See [AI_INTEGRATION.md](AI_INTEGRATION.md) for complete guide.

## Future Development

- Streaming AI responses
- Multi-provider AI support (Claude, local models)
- Node types and categories
- Export/import trees
- Collaborative editing
- Voice input
- Smart auto-layout
- Search across tree

## License

See LICENSE file for details.
