import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Users, BarChart3, BookOpen, X } from 'lucide-react'
import MockLayout from '../MockLayout'
import Button from '../../components/Button'
import { courses, students, getClassMastery, conceptNodes, graphAssignments } from '../data/mockData'

const TeacherDashboard = () => {
  const navigate = useNavigate()
  const [showAddModal, setShowAddModal] = useState(false)
  const [addedCourses, setAddedCourses] = useState([])

  const getCourseMastery = (courseId) => {
    const allAssignments = graphAssignments[courseId] || []
    let totalMastery = 0
    let count = 0
    allAssignments.forEach(a => {
      const nodes = conceptNodes[a.id] || []
      nodes.forEach(n => {
        totalMastery += getClassMastery(n.id, courseId)
        count++
      })
    })
    return count > 0 ? Math.round(totalMastery / count) : 0
  }

  const handleAddCourse = () => {
    const newCourse = {
      id: `c-new-${Date.now()}`,
      code: 'CS 4400',
      name: 'Introduction to Databases',
      studentCount: 0,
    }
    setAddedCourses(prev => [...prev, newCourse])
    setShowAddModal(false)
  }

  const allCourses = [
    ...courses.map(c => ({
      ...c,
      studentCount: c.studentIds.length,
      mastery: getCourseMastery(c.id),
    })),
    ...addedCourses,
  ]

  return (
    <MockLayout
      role="teacher"
      breadcrumbs={[{ label: 'Dashboard' }]}
    >
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl xl:text-4xl font-bold text-white mb-2">
            Welcome, Dr. Chen
          </h1>
          <p className="text-forest-light-gray text-lg">
            Manage your courses and track student progress
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {/* Add Class Card */}
          <motion.button
            type="button"
            onClick={() => setShowAddModal(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="bg-forest-card/50 backdrop-blur-sm border-2 border-dashed border-forest-border hover:border-amber-400/60 rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-colors min-h-[220px] cursor-pointer"
          >
            <Plus size={28} className="text-amber-400" />
            <span className="text-forest-light-gray font-medium">Add a Class</span>
          </motion.button>

          {/* Course Cards */}
          <AnimatePresence>
            {allCourses.map((course, i) => (
              <motion.div
                key={course.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * (i + 1) }}
                onClick={() => {
                  if (course.id.startsWith('c-new')) return
                  navigate(`/mockup/teacher/course/${course.id}`)
                }}
                className={`bg-forest-card/70 backdrop-blur-sm border border-forest-border rounded-xl p-6 flex flex-col justify-between min-h-[220px] group ${
                  course.id.startsWith('c-new') ? 'opacity-60' : 'cursor-pointer hover:border-amber-400/40'
                } transition-colors`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono text-amber-400 bg-amber-400/10 px-2 py-1 rounded">
                      {course.code}
                    </span>
                    <BookOpen size={18} className="text-forest-gray" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-3 group-hover:text-amber-400 transition-colors">
                    {course.name}
                  </h3>
                  <div className="flex items-center gap-4 text-sm text-forest-gray">
                    <span className="flex items-center gap-1.5">
                      <Users size={14} />
                      {course.studentCount} students
                    </span>
                    {course.mastery !== undefined && (
                      <span className="flex items-center gap-1.5">
                        <BarChart3 size={14} />
                        {course.mastery}% avg mastery
                      </span>
                    )}
                  </div>
                </div>

                {course.mastery !== undefined && (
                  <div className="mt-4 pt-4 border-t border-forest-border/30">
                    <div className="flex items-center justify-between text-xs text-forest-gray mb-1.5">
                      <span>Class Mastery</span>
                      <span>{course.mastery}%</span>
                    </div>
                    <div className="w-full h-2 bg-forest-dark rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${course.mastery}%` }}
                        transition={{ duration: 0.8, delay: 0.2 + i * 0.1 }}
                        className={`h-full rounded-full ${
                          course.mastery >= 70 ? 'bg-emerald-500' :
                          course.mastery >= 40 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                      />
                    </div>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Add Class Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-forest-card border border-forest-border rounded-xl p-6 w-full max-w-md mx-4"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-white">Add a Class</h2>
                <button onClick={() => setShowAddModal(false)} className="text-forest-gray hover:text-white">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm text-forest-light-gray mb-1.5">Course Code</label>
                  <input
                    type="text"
                    defaultValue="CS 4400"
                    className="w-full bg-forest-dark border border-forest-border rounded-lg px-4 py-2.5 text-white focus:border-amber-400 focus:outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm text-forest-light-gray mb-1.5">Course Name</label>
                  <input
                    type="text"
                    defaultValue="Introduction to Databases"
                    className="w-full bg-forest-dark border border-forest-border rounded-lg px-4 py-2.5 text-white focus:border-amber-400 focus:outline-none transition-colors"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setShowAddModal(false)} className="flex-1 !text-sm">
                  Cancel
                </Button>
                <button
                  onClick={handleAddCourse}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-amber-600 text-forest-darker font-medium py-3 rounded-lg hover:brightness-110 transition-all"
                >
                  Add Course
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MockLayout>
  )
}

export default TeacherDashboard
