import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import KnowledgeGraph from '../components/KnowledgeGraph'
import Logo from '../components/Logo'
import Button from '../components/Button'

/** Animation: question mark transforms into a node (concept) - faster transition */
const QuestionToNodeAnimation = () => {
  const [phase, setPhase] = useState('question')

  React.useEffect(() => {
    const t = setInterval(() => {
      setPhase((p) => (p === 'question' ? 'node' : 'question'))
    }, 1800)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <AnimatePresence mode="wait">
        {phase === 'question' ? (
          <motion.div
            key="question"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.3 }}
            transition={{ duration: 0.25 }}
            className="absolute text-5xl xl:text-6xl font-bold text-forest-emerald"
          >
            ?
          </motion.div>
        ) : (
          <motion.div
            key="node"
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute w-10 h-10 xl:w-12 xl:h-12 rounded-full bg-forest-emerald shadow-lg shadow-forest-emerald/50"
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/** Bronze, Silver, Gold nodes - more questions = stronger node */
const BronzeSilverGoldAnimation = () => {
  const nodes = [
    { color: 'bg-amber-700', shadow: 'shadow-amber-700/50', label: 'Bronze', size: 'w-6 h-6' },
    { color: 'bg-gray-400', shadow: 'shadow-gray-400/50', label: 'Silver', size: 'w-8 h-8' },
    { color: 'bg-amber-400', shadow: 'shadow-amber-400/50', label: 'Gold', size: 'w-10 h-10' },
  ]
  return (
    <div className="flex items-end justify-center gap-2 w-full max-w-[96px] min-h-[80px]">
      {nodes.map((node, i) => (
        <motion.div
          key={node.label}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, delay: i * 0.35 }}
          className={`rounded-full shrink-0 ${node.color} ${node.shadow} shadow-lg ${node.size}`}
          title={node.label}
        />
      ))}
    </div>
  )
}

/** Animation: nodes appear and grow with connections (forest building) */
const FOREST_NODES = [
  { x: 50, y: 50, delay: 0 },
  { x: 20, y: 25, delay: 0.2 },
  { x: 80, y: 25, delay: 0.3 },
  { x: 15, y: 70, delay: 0.4 },
  { x: 85, y: 70, delay: 0.5 },
  { x: 50, y: 15, delay: 0.1 },
  { x: 50, y: 85, delay: 0.6 },
]

// Pairs of node indices to connect (center=0, then clockwise/top)
const FOREST_EDGES = [
  [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6],
  [1, 3], [2, 4], [5, 1], [5, 2], [6, 3], [6, 4],
]

const ForestGrowingAnimation = () => {
  const [key, setKey] = useState(0)
  const size = 96 // content area inside grey card (128 - 32 padding)
  React.useEffect(() => {
    const t = setInterval(() => setKey((k) => k + 1), 3200)
    return () => clearInterval(t)
  }, [])

  const nodePx = (pct) => (pct / 100) * size

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Connection lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ width: size, height: size }}>
        {FOREST_EDGES.map(([a, b], i) => (
          <motion.line
            key={`${key}-line-${i}`}
            x1={nodePx(FOREST_NODES[a].x)}
            y1={nodePx(FOREST_NODES[a].y)}
            x2={nodePx(FOREST_NODES[b].x)}
            y2={nodePx(FOREST_NODES[b].y)}
            stroke="rgba(52, 211, 153, 0.5)"
            strokeWidth="1.5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: Math.max(FOREST_NODES[a].delay, FOREST_NODES[b].delay) + 0.1 }}
          />
        ))}
      </svg>
      {FOREST_NODES.map((node, i) => (
        <motion.div
          key={`${key}-${i}`}
          className="absolute rounded-full bg-forest-emerald shadow-lg shadow-forest-emerald/50"
          style={{
            left: `${node.x}%`,
            top: `${node.y}%`,
            width: 12,
            height: 12,
            marginLeft: -6,
            marginTop: -6,
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{
            duration: 0.45,
            delay: node.delay,
          }}
        />
      ))}
    </div>
  )
}

const Home = () => {
  return (
    <div className="min-h-screen relative overflow-hidden">
      <KnowledgeGraph opacity={0.35} />

      {/* Header */}
      <header className="relative z-10 border-b border-forest-border/30 bg-forest-darker/20 backdrop-blur-md">
        <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12 py-4">
          <div className="flex items-center justify-between">
            <Logo size="md" clickable />
            <div className="flex items-center gap-4">
              <Link to="/login">
                <Button variant="ghost">Sign In</Button>
              </Link>
              <Link to="/signup">
                <Button variant="primary">Get Started</Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12">
        <div className="min-h-[calc(100vh-80px)] flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl"
          >
            <h1 className="text-5xl md:text-6xl xl:text-7xl 2xl:text-8xl font-bold text-white mb-6">
              Master Any Subject with{' '}
              <span className="bg-gradient-to-r from-forest-emerald to-forest-teal bg-clip-text text-transparent">
                AI Guidance
              </span>
            </h1>
            <p className="text-lg xl:text-xl 2xl:text-2xl text-forest-light-gray mb-10 max-w-2xl xl:max-w-3xl mx-auto">
              Forest combines cutting-edge AI with visual knowledge mapping to create
              a personalized learning experience that adapts to you.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link to="/signup">
                <Button variant="primary" className="text-lg px-8 py-4">
                  <span className="flex items-center gap-2">
                    Start Learning Free
                    <ArrowRight size={20} />
                  </span>
                </Button>
              </Link>
            </div>
          </motion.div>

          {/* How Forest Works - Horizontal Flow */}
          <motion.section
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="mt-24 w-full max-w-6xl"
          >
            <div className="flex flex-col lg:flex-row items-center justify-center gap-8 lg:gap-4">
              {/* Cell 1: Question → Node */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="flex flex-col items-center text-center w-full lg:flex-1 max-w-sm"
              >
                <div className="relative w-32 h-32 flex items-center justify-center mb-4 rounded-xl bg-gray-700/80 p-4">
                  <QuestionToNodeAnimation />
                </div>
                <h3 className="text-forest-emerald font-semibold text-lg xl:text-xl mb-2">1. Ask</h3>
                <p className="text-forest-light-gray text-sm xl:text-base">
                  Pose a question about anything you're learning.
                </p>
              </motion.div>

              {/* Arrow */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="hidden lg:block text-forest-emerald/50"
              >
                <ArrowRight size={32} className="rotate-0" />
              </motion.div>

              {/* Cell 2: Ask again - Bronze, Silver, Gold */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.5 }}
                className="flex flex-col items-center text-center w-full lg:flex-1 max-w-sm"
              >
                <div className="w-32 h-32 flex items-center justify-center mb-4 rounded-xl bg-gray-700/80 p-4 overflow-hidden">
                  <BronzeSilverGoldAnimation />
                </div>
                <h3 className="text-forest-emerald font-semibold text-lg xl:text-xl mb-2">2. Ask again</h3>
                <p className="text-forest-light-gray text-sm xl:text-base">
                  Keep asking — your node grows from bronze to silver to gold.
                </p>
              </motion.div>

              {/* Arrow */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="hidden lg:block text-forest-emerald/50"
              >
                <ArrowRight size={32} />
              </motion.div>

              {/* Cell 3: Forest growing */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8, duration: 0.5 }}
                className="flex flex-col items-center text-center w-full lg:flex-1 max-w-sm"
              >
                <div className="w-32 h-32 flex items-center justify-center mb-4 rounded-xl bg-gray-700/80 p-4">
                  <ForestGrowingAnimation />
                </div>
                <h3 className="text-forest-emerald font-semibold text-lg xl:text-xl mb-2">3. Your Forest grows</h3>
                <p className="text-forest-light-gray text-sm xl:text-base">
                  Each concept becomes a node. The more you ask, the stronger it grows.
                </p>
              </motion.div>
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  )
}

export default Home
