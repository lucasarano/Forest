# Forest Mockup Deployment

## 🚀 Live URLs

**Primary Production URL**: https://forest-mockup.vercel.app

**Alternative URLs**:
- https://forest-mockup-cobilanding.vercel.app
- https://forest-mockup-lucasarano-cobilanding.vercel.app

## 📱 Mockup Routes

### Entry Points
- `/mockup` - Login page (select Teacher or Student role)
- `/mockup/roles` - Role picker (alternative entry)

### Teacher Flow
1. **Dashboard**: `/mockup/teacher`
   - View all taught courses
   - Add new classes
   - See average mastery per course

2. **Course Detail**: `/mockup/teacher/course/:courseId`
   - **Content Tab**: Lectures, files, course description
   - **Analytics Tab**: Per-concept mastery breakdown with red/amber/green indicators
   - **Graph Tab**: Interactive concept graph showing student struggles
   - **People Tab**: Student roster with individual mastery scores

3. **Node Detail**: `/mockup/teacher/course/:courseId/node/:nodeId`
   - Average mastery score
   - Common student questions
   - Student performance breakdown
   - Related sub-concepts

### Student Flow
1. **Dashboard**: `/mockup/student`
   - View enrolled courses
   - Overall mastery progress

2. **Course Detail**: `/mockup/student/course/:courseId`
   - **Lectures Tab**: Video lectures with dates
   - **Files Tab**: Downloadable course materials
   - **Grades Tab**: Assignment scores and overall grade
   - **Graph Assignments Tab**: List of concept graph assignments

3. **Graph Assignment**: `/mockup/student/course/:courseId/graph/:assignmentId`
   - Interactive concept graph (foundations = green, advanced = dark)
   - Click nodes to study with AI
   - "Take Test" button for mastery assessment

4. **Node Chat**: `/mockup/student/course/:courseId/graph/:assignmentId/node/:nodeId`
   - AI chat interface for the concept
   - Mastery indicator that increases with interaction
   - Real-time strength visualization

5. **Test Mode**: `/mockup/student/course/:courseId/graph/:assignmentId/test`
   - Multiple-choice diagnostic questions
   - Immediate feedback (correct/incorrect)
   - Per-concept mastery breakdown
   - Overall mastery score

## 🎨 Design Features

- **Color Scheme**: Dark forest theme with emerald/green accents
- **Mastery Visualization**: 
  - Green (80%+) = Mastered
  - Yellow-green (60-80%) = Moderate
  - Gray (40-60%) = Needs work
  - Dark gray/red (<40%) = Struggling
- **Graph Structure**: Bottom-up learning (foundations at bottom, advanced topics at top)
- **Dependency System**: Parent node mastery depends on child node mastery

## 📊 Mock Data

### Courses
- **CS 3510**: Design & Analysis of Algorithms (5 students)
- **CS 1332**: Data Structures & Algorithms (3 students)

### Students
1. Alex Rivera (s1)
2. Jordan Park (s2)
3. Maya Thompson (s3)
4. Liam Nguyen (s4)
5. Priya Sharma (s5)

### Teacher
- Dr. Sarah Chen

### Graph Assignments
1. **Dynamic Programming Mastery** (10 nodes)
   - Foundations: Recursion, Base Cases, Overlapping Subproblems, Optimal Substructure
   - Techniques: Memoization, Tabulation
   - Applications: Fibonacci DP, LCS, Knapsack, Edit Distance

2. **Graph Algorithms Mastery** (10 nodes)
   - Foundations: Adjacency List/Matrix, Queue, Stack
   - Core: BFS, DFS
   - Advanced: Topological Sort, Dijkstra's, Bellman-Ford, A* Search

3. **Trees & Data Structures Mastery** (10 nodes)
   - Foundations: Arrays, Linked Lists, Recursion, Pointers
   - Basics: Binary Trees, Tree Traversals
   - Advanced: BST Operations, AVL Trees, Red-Black Trees, B-Trees

## 🛠️ Technology Stack

- **Framework**: React 18 + Vite
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Routing**: React Router v6
- **Deployment**: Vercel

## 📝 Notes

- This is a **mockup/prototype** with pre-filled demo data
- No backend authentication required
- All data is static and client-side only
- Designed for user testing and feedback collection
