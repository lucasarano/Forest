import React from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen, TrendingUp, GraduationCap } from 'lucide-react'
import MockLayout from '../MockLayout'
import { courses, studentMastery, graphAssignments, conceptNodes } from '../data/mockData'

const CURRENT_STUDENT = 's1'

const StudentDashboard = () => {
  const navigate = useNavigate()

  const enrolledCourses = courses.filter(c => c.studentIds.includes(CURRENT_STUDENT))

  const getStudentCourseMastery = (courseId) => {
    const assignments = graphAssignments[courseId] || []
    const nodes = assignments.flatMap(a => conceptNodes[a.id] || [])
    const scores = nodes
      .map(n => studentMastery[CURRENT_STUDENT]?.[n.id])
      .filter(s => s !== undefined)
    if (scores.length === 0) return 0
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  }

  return (
    <MockLayout
      role="student"
      breadcrumbs={[{ label: 'Dashboard' }]}
    >
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl xl:text-4xl font-bold text-white mb-2">
            Welcome back, Alex
          </h1>
          <p className="text-forest-light-gray text-lg">
            Continue your learning journey
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {enrolledCourses.map((course, i) => {
            const mastery = getStudentCourseMastery(course.id)
            return (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * (i + 1) }}
                onClick={() => navigate(`/mockup/student/course/${course.id}`)}
                className="bg-forest-card/70 backdrop-blur-sm border border-forest-border hover:border-forest-emerald/40 rounded-xl p-6 cursor-pointer group transition-colors"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-mono text-forest-emerald bg-forest-emerald/10 px-2 py-1 rounded">
                    {course.code}
                  </span>
                  <BookOpen size={18} className="text-forest-gray" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-forest-emerald transition-colors">
                  {course.name}
                </h3>
                <div className="flex items-center gap-2 text-sm text-forest-gray mb-4">
                  <GraduationCap size={14} />
                  <span>{course.instructor}</span>
                </div>

                <div className="pt-4 border-t border-forest-border/30">
                  <div className="flex items-center justify-between text-xs text-forest-gray mb-1.5">
                    <span className="flex items-center gap-1">
                      <TrendingUp size={12} />
                      Your Mastery
                    </span>
                    <span className="font-medium text-forest-light-gray">{mastery}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-forest-dark rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${mastery}%` }}
                      transition={{ duration: 0.8, delay: 0.3 + i * 0.1 }}
                      className="h-full rounded-full"
                      style={{
                        background: `linear-gradient(90deg, #4b5563 ${0}%, #10b981 ${100}%)`,
                        opacity: 0.3 + (mastery / 100) * 0.7,
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </MockLayout>
  )
}

export default StudentDashboard
