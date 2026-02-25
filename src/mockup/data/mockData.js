export const teacher = {
  id: 't1',
  name: 'Dr. Sarah Chen',
  email: 'schen@gatech.edu',
  role: 'teacher',
}

export const students = [
  { id: 's1', name: 'Alex Rivera', email: 'arivera@gatech.edu' },
  { id: 's2', name: 'Jordan Park', email: 'jpark@gatech.edu' },
  { id: 's3', name: 'Maya Thompson', email: 'mthompson@gatech.edu' },
  { id: 's4', name: 'Liam Nguyen', email: 'lnguyen@gatech.edu' },
  { id: 's5', name: 'Priya Sharma', email: 'psharma@gatech.edu' },
]

export const courses = [
  {
    id: 'c1',
    code: 'CS 3510',
    name: 'Design & Analysis of Algorithms',
    instructor: teacher.name,
    description: 'Covers algorithmic design paradigms including divide and conquer, greedy algorithms, dynamic programming, graph algorithms, and NP-completeness.',
    studentIds: ['s1', 's2', 's3', 's4', 's5'],
    semester: 'Spring 2026',
  },
  {
    id: 'c2',
    code: 'CS 1332',
    name: 'Data Structures & Algorithms',
    instructor: teacher.name,
    description: 'Introduction to data structures including arrays, linked lists, stacks, queues, trees, hash tables, and sorting algorithms.',
    studentIds: ['s1', 's2', 's3'],
    semester: 'Spring 2026',
  },
]

export const lectures = {
  c1: [
    { id: 'l1', title: 'Intro to Algorithm Analysis', date: '2026-01-12', duration: '50 min' },
    { id: 'l2', title: 'Divide and Conquer', date: '2026-01-14', duration: '50 min' },
    { id: 'l3', title: 'Merge Sort & Recurrences', date: '2026-01-19', duration: '50 min' },
    { id: 'l4', title: 'Dynamic Programming I', date: '2026-01-21', duration: '50 min' },
    { id: 'l5', title: 'Dynamic Programming II', date: '2026-01-26', duration: '50 min' },
    { id: 'l6', title: 'Graph Algorithms: BFS & DFS', date: '2026-02-02', duration: '50 min' },
    { id: 'l7', title: 'Shortest Paths', date: '2026-02-09', duration: '50 min' },
  ],
  c2: [
    { id: 'l8', title: 'Arrays & ArrayList', date: '2026-01-12', duration: '50 min' },
    { id: 'l9', title: 'Linked Lists', date: '2026-01-14', duration: '50 min' },
    { id: 'l10', title: 'Stacks & Queues', date: '2026-01-19', duration: '50 min' },
    { id: 'l11', title: 'Binary Search Trees', date: '2026-01-21', duration: '50 min' },
    { id: 'l12', title: 'Hash Tables', date: '2026-01-26', duration: '50 min' },
  ],
}

export const files = {
  c1: [
    { id: 'f1', name: 'Syllabus.pdf', type: 'pdf', size: '245 KB' },
    { id: 'f2', name: 'HW1 - Recurrences.pdf', type: 'pdf', size: '180 KB' },
    { id: 'f3', name: 'HW2 - Dynamic Programming.pdf', type: 'pdf', size: '210 KB' },
    { id: 'f4', name: 'Midterm Review Notes.pdf', type: 'pdf', size: '320 KB' },
  ],
  c2: [
    { id: 'f5', name: 'Syllabus.pdf', type: 'pdf', size: '200 KB' },
    { id: 'f6', name: 'HW1 - Arrays & Linked Lists.pdf', type: 'pdf', size: '150 KB' },
    { id: 'f7', name: 'HW2 - Trees.pdf', type: 'pdf', size: '175 KB' },
  ],
}

export const grades = {
  c1: [
    { id: 'g1', name: 'HW 1 - Recurrences', score: 88, maxScore: 100 },
    { id: 'g2', name: 'HW 2 - Dynamic Programming', score: 72, maxScore: 100 },
    { id: 'g3', name: 'Midterm Exam', score: 81, maxScore: 100 },
  ],
  c2: [
    { id: 'g4', name: 'HW 1 - Arrays & Linked Lists', score: 95, maxScore: 100 },
    { id: 'g5', name: 'HW 2 - Trees', score: 78, maxScore: 100 },
  ],
}

export const graphAssignments = {
  c1: [
    { id: 'ga1', name: 'Dynamic Programming Mastery', nodeCount: 10, dueDate: '2026-02-15' },
    { id: 'ga2', name: 'Graph Algorithms Mastery', nodeCount: 10, dueDate: '2026-03-01' },
  ],
  c2: [
    { id: 'ga3', name: 'Trees & Data Structures Mastery', nodeCount: 10, dueDate: '2026-02-20' },
  ],
}

// Concept nodes - Structure: Parent = Complete Topic, Children = Prerequisites
// Students must master children (foundations) before parent (advanced topic)
export const conceptNodes = {
  ga1: [
    // Dynamic Programming - Bottom to Top (foundations to advanced)
    { id: 'n1', label: 'Recursion', x: 200, y: 540, parentIds: [] },
    { id: 'n2', label: 'Base Cases', x: 400, y: 540, parentIds: [] },
    { id: 'n3', label: 'Overlapping Subproblems', x: 600, y: 540, parentIds: [] },
    { id: 'n4', label: 'Optimal Substructure', x: 800, y: 540, parentIds: [] },
    { id: 'n5', label: 'Memoization', x: 300, y: 380, parentIds: ['n1', 'n2', 'n3'] },
    { id: 'n16', label: 'Tabulation', x: 700, y: 380, parentIds: ['n2', 'n3', 'n4'] },
    { id: 'n17', label: 'Fibonacci DP', x: 200, y: 220, parentIds: ['n5'] },
    { id: 'n18', label: 'Longest Common Subsequence', x: 500, y: 220, parentIds: ['n5', 'n16'] },
    { id: 'n19', label: 'Knapsack Problem', x: 800, y: 220, parentIds: ['n16', 'n4'] },
    { id: 'n20', label: 'Edit Distance', x: 500, y: 80, parentIds: ['n18', 'n19'] },
  ],
  ga2: [
    // Graph Algorithms - Bottom to Top
    { id: 'n6', label: 'Adjacency List', x: 200, y: 540, parentIds: [] },
    { id: 'n7', label: 'Adjacency Matrix', x: 400, y: 540, parentIds: [] },
    { id: 'n21', label: 'Queue', x: 600, y: 540, parentIds: [] },
    { id: 'n22', label: 'Stack', x: 800, y: 540, parentIds: [] },
    { id: 'n8', label: 'BFS', x: 300, y: 380, parentIds: ['n6', 'n21'] },
    { id: 'n9', label: 'DFS', x: 700, y: 380, parentIds: ['n6', 'n22'] },
    { id: 'n10', label: 'Topological Sort', x: 200, y: 220, parentIds: ['n9'] },
    { id: 'n23', label: 'Dijkstra\'s Algorithm', x: 500, y: 220, parentIds: ['n8', 'n21'] },
    { id: 'n24', label: 'Bellman-Ford', x: 800, y: 220, parentIds: ['n8'] },
    { id: 'n25', label: 'A* Search', x: 500, y: 80, parentIds: ['n23', 'n24'] },
  ],
  ga3: [
    // Trees & Data Structures - Bottom to Top
    { id: 'n11', label: 'Arrays', x: 200, y: 540, parentIds: [] },
    { id: 'n12', label: 'Linked Lists', x: 400, y: 540, parentIds: [] },
    { id: 'n26', label: 'Recursion', x: 600, y: 540, parentIds: [] },
    { id: 'n27', label: 'Pointers', x: 800, y: 540, parentIds: [] },
    { id: 'n13', label: 'Binary Trees', x: 300, y: 380, parentIds: ['n12', 'n26', 'n27'] },
    { id: 'n14', label: 'Tree Traversals', x: 700, y: 380, parentIds: ['n13', 'n26'] },
    { id: 'n15', label: 'BST Operations', x: 200, y: 220, parentIds: ['n13'] },
    { id: 'n28', label: 'AVL Trees', x: 500, y: 220, parentIds: ['n15', 'n14'] },
    { id: 'n29', label: 'Red-Black Trees', x: 800, y: 220, parentIds: ['n15', 'n14'] },
    { id: 'n30', label: 'B-Trees', x: 500, y: 80, parentIds: ['n28', 'n29'] },
  ],
}

// Base mastery scores for leaf nodes (foundational prerequisites at the bottom)
// Higher scores for foundations, lower for advanced topics
const baseMasteryScores = {
  s1: { 
    // ga1 - Dynamic Programming foundations (bottom nodes have HIGH mastery)
    n1: 88, // Recursion
    n2: 92, // Base Cases
    n3: 85, // Overlapping Subproblems
    n4: 82, // Optimal Substructure
    // ga2 - Graph Algorithm foundations
    n6: 90, // Adjacency List
    n7: 88, // Adjacency Matrix
    n21: 95, // Queue
    n22: 93, // Stack
    // ga3 - Tree foundations
    n11: 94, // Arrays
    n12: 90, // Linked Lists
    n26: 88, // Recursion
    n27: 92, // Pointers
  },
  s2: { 
    n1: 82, 
    n2: 85, 
    n3: 78,
    n4: 75,
    n6: 83,
    n7: 80,
    n21: 88,
    n22: 86,
    n11: 87,
    n12: 84,
    n26: 82,
    n27: 85,
  },
  s3: { 
    n1: 92,
    n2: 95,
    n3: 90,
    n4: 88,
    n6: 93,
    n7: 91,
    n21: 96,
    n22: 94,
    n11: 95,
    n12: 93,
    n26: 91,
    n27: 94,
  },
  s4: { 
    n1: 72,
    n2: 75,
    n3: 68,
    n4: 65,
    n6: 70,
    n7: 68,
    n21: 78,
    n22: 76,
    n11: 80,
    n12: 75,
    n26: 72,
    n27: 74,
  },
  s5: { 
    n1: 85,
    n2: 88,
    n3: 82,
    n4: 79,
    n6: 86,
    n7: 84,
    n21: 90,
    n22: 88,
    n11: 89,
    n12: 86,
    n26: 84,
    n27: 87,
  },
}

// Calculate mastery with parent dependency influence
// Child nodes (advanced concepts) should have LOWER mastery than parent nodes (foundations)
function calculateMasteryWithDependency(studentId, nodeId) {
  const base = baseMasteryScores[studentId]?.[nodeId]
  if (base !== undefined) return base
  
  // Find the node to get its parents
  let node = null
  for (const nodes of Object.values(conceptNodes)) {
    node = nodes.find(n => n.id === nodeId)
    if (node) break
  }
  
  if (!node || !node.parentIds || node.parentIds.length === 0) {
    return 50 // Default if no base score and no parents
  }
  
  // Calculate average of parent scores
  const parentScores = node.parentIds
    .map(pid => calculateMasteryWithDependency(studentId, pid))
    .filter(score => score !== undefined)
  
  if (parentScores.length === 0) return 50
  
  const avgParentScore = parentScores.reduce((a, b) => a + b, 0) / parentScores.length
  
  // Child node mastery is LOWER than parent (advanced concepts are harder)
  // Apply a decay factor: child = parent * 0.6-0.8 (40-20% reduction)
  const decayFactor = 0.65 + Math.random() * 0.15 // Random between 0.65 and 0.8
  const variation = (Math.random() - 0.5) * 10 // -5 to +5 for some randomness
  const childScore = avgParentScore * decayFactor + variation
  
  return Math.max(5, Math.min(100, Math.round(childScore)))
}

// Generate complete mastery scores with dependency calculation
export const studentMastery = {}
const allNodeIds = new Set()
Object.values(conceptNodes).forEach(nodes => {
  nodes.forEach(n => allNodeIds.add(n.id))
})

students.forEach(student => {
  studentMastery[student.id] = {}
  allNodeIds.forEach(nodeId => {
    studentMastery[student.id][nodeId] = calculateMasteryWithDependency(student.id, nodeId)
  })
})

// Class-wide average mastery per node (for teacher view)
export function getClassMastery(nodeId, courseId) {
  const course = courses.find(c => c.id === courseId)
  if (!course) return 0
  const scores = course.studentIds
    .map(sid => studentMastery[sid]?.[nodeId])
    .filter(s => s !== undefined)
  if (scores.length === 0) return 0
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

// Common student questions per node
export const nodeQuestions = {
  n1: [
    'What is the difference between recursion and iteration?',
    'How do I identify the base case?',
    'Why does my recursive function cause a stack overflow?',
  ],
  n2: [
    'When should I use memoization vs tabulation?',
    'How do I know which subproblems to cache?',
    'What is the space complexity of memoization?',
  ],
  n3: [
    'How do I determine the order to fill the table?',
    'What is bottom-up vs top-down?',
    'How do I reconstruct the solution from the table?',
  ],
  n4: [
    'How do I set up the DP table for LCS?',
    'What is the time complexity of LCS?',
    'How do I handle strings of different lengths?',
  ],
  n5: [
    'What is the difference between 0/1 and fractional knapsack?',
    'How do I trace back the selected items?',
    'Why doesn\'t greedy work for 0/1 knapsack?',
  ],
  n6: [
    'When should I use adjacency list vs adjacency matrix?',
    'How do I represent weighted graphs?',
  ],
  n7: ['How does BFS guarantee shortest path in unweighted graphs?', 'What data structure does BFS use?'],
  n8: ['What is the difference between pre-order and post-order DFS?', 'How do I detect cycles with DFS?'],
  n9: ['Why doesn\'t Dijkstra work with negative weights?', 'What is the time complexity with a min-heap?'],
  n10: ['When is topological sort applicable?', 'Can I topologically sort a graph with cycles?'],
}

// Sub-concepts for each node (teacher node detail view)
export const subConcepts = {
  n1: ['Base cases', 'Recursive calls', 'Call stack', 'Tail recursion'],
  n2: ['Top-down approach', 'Hash map caching', 'Overlapping subproblems'],
  n3: ['Bottom-up approach', 'Table initialization', 'Iterative filling'],
  n4: ['String alignment', 'Subsequence vs substring', 'Backtracking solution'],
  n5: ['Item selection', 'Weight constraints', 'Optimal substructure'],
  n6: ['Adjacency list', 'Adjacency matrix', 'Edge list', 'Weighted edges'],
  n7: ['Queue-based traversal', 'Level ordering', 'Shortest path (unweighted)'],
  n8: ['Stack-based traversal', 'Pre/Post/In-order', 'Cycle detection'],
  n9: ['Priority queue', 'Relaxation', 'Negative weights limitation'],
  n10: ['DAG requirement', 'Kahn\'s algorithm', 'DFS-based ordering'],
}

// Mock chat messages for student node chat
export const nodeChatMessages = {
  n1: [
    { role: 'assistant', content: 'Welcome! Let\'s explore **Recursion Basics**. Recursion is when a function calls itself to solve smaller instances of the same problem. Can you think of a simple example?' },
    { role: 'user', content: 'Like calculating factorial?' },
    { role: 'assistant', content: 'Exactly! `factorial(n) = n * factorial(n-1)` with base case `factorial(0) = 1`. Every recursive function needs:\n\n1. **Base case** - when to stop\n2. **Recursive case** - breaking the problem down\n\nWhat happens if we forget the base case?' },
  ],
  n2: [
    { role: 'assistant', content: 'Let\'s dive into **Memoization**. This technique stores results of expensive function calls to avoid redundant computation. Think of Fibonacci - how many times does `fib(3)` get called in a naive recursive approach?' },
    { role: 'user', content: 'Multiple times because both fib(4) and fib(5) need it?' },
    { role: 'assistant', content: 'Right! In a naive recursive Fibonacci, `fib(3)` gets computed multiple times. Memoization solves this by caching results:\n\n```python\nmemo = {}\ndef fib(n):\n    if n in memo: return memo[n]\n    if n <= 1: return n\n    memo[n] = fib(n-1) + fib(n-2)\n    return memo[n]\n```\n\nThis reduces time complexity from O(2^n) to O(n).' },
  ],
  n4: [
    { role: 'assistant', content: 'Let\'s work through the **Longest Common Subsequence** problem. Given two strings, we want the longest sequence of characters that appears in both (in order, but not necessarily contiguous). How would you start thinking about this?' },
  ],
}

// Diagnostic questions for test mode
export const diagnosticQuestions = {
  n1: [
    {
      id: 'q1',
      question: 'What is required for every recursive function to terminate?',
      options: ['A loop counter', 'A base case', 'A global variable', 'An iterative backup'],
      correctIndex: 1,
    },
    {
      id: 'q2',
      question: 'What is the time complexity of naive recursive Fibonacci?',
      options: ['O(n)', 'O(n log n)', 'O(2^n)', 'O(n^2)'],
      correctIndex: 2,
    },
    {
      id: 'q3',
      question: 'Which data structure tracks recursive function calls?',
      options: ['Queue', 'Call stack', 'Heap', 'Hash table'],
      correctIndex: 1,
    },
  ],
  n2: [
    {
      id: 'q4',
      question: 'Memoization is an example of which approach?',
      options: ['Bottom-up', 'Top-down', 'Greedy', 'Brute force'],
      correctIndex: 1,
    },
    {
      id: 'q5',
      question: 'What does memoization primarily reduce?',
      options: ['Space complexity', 'Redundant subproblem computation', 'Code readability', 'Stack depth'],
      correctIndex: 1,
    },
    {
      id: 'q6',
      question: 'Which data structure is commonly used for memoization?',
      options: ['Stack', 'Queue', 'Hash map / dictionary', 'Linked list'],
      correctIndex: 2,
    },
  ],
  n3: [
    {
      id: 'q7',
      question: 'Tabulation fills a table in which order?',
      options: ['Top-down', 'Bottom-up', 'Random', 'Right to left'],
      correctIndex: 1,
    },
    {
      id: 'q8',
      question: 'Compared to memoization, tabulation typically uses:',
      options: ['More stack space', 'Less stack space', 'More recursive calls', 'A hash map'],
      correctIndex: 1,
    },
    {
      id: 'q9',
      question: 'What is the main advantage of tabulation over memoization?',
      options: ['Easier to code', 'No risk of stack overflow', 'Always faster', 'Uses less memory'],
      correctIndex: 1,
    },
  ],
}

// Mock AI responses for the chat
export const mockAIResponses = [
  'Great question! Let me break this down step by step...',
  'That\'s a common misconception. Here\'s how to think about it correctly...',
  'You\'re on the right track! The key insight is that each subproblem only needs to be solved once.',
  'Let\'s work through an example together. Consider the input [3, 1, 4, 1, 5]...',
  'Excellent observation! This connects to the principle of optimal substructure.',
  'Think about it this way: if the optimal solution includes item i, what does that tell us about the remaining items?',
]

export function getRandomAIResponse() {
  return mockAIResponses[Math.floor(Math.random() * mockAIResponses.length)]
}

export function getStudentById(id) {
  return students.find(s => s.id === id)
}

export function getCourseById(id) {
  return courses.find(c => c.id === id)
}

export function getNodeById(nodeId) {
  for (const nodes of Object.values(conceptNodes)) {
    const found = nodes.find(n => n.id === nodeId)
    if (found) return found
  }
  return null
}

export function getAssignmentById(assignmentId) {
  for (const assignments of Object.values(graphAssignments)) {
    const found = assignments.find(a => a.id === assignmentId)
    if (found) return found
  }
  return null
}

export function getNodeMasteryColor(mastery) {
  if (mastery >= 80) return '#10b981' // emerald green
  if (mastery >= 60) return '#34d399' // lighter green
  if (mastery >= 40) return '#6b7280' // gray
  if (mastery >= 20) return '#4b5563' // darker gray
  return '#374151' // very dark gray
}

export function getTeacherNodeColor(mastery) {
  if (mastery >= 80) return '#10b981' // green
  if (mastery >= 60) return '#84cc16' // lime
  if (mastery >= 40) return '#eab308' // yellow
  if (mastery >= 20) return '#f97316' // orange
  return '#ef4444' // red
}
