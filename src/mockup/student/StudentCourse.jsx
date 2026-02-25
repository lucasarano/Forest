import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Video, FileText, Award, GitBranch, Calendar, Download, CheckCircle, XCircle,
} from 'lucide-react'
import MockLayout from '../MockLayout'
import {
  getCourseById, lectures, files, grades, graphAssignments, conceptNodes,
  studentMastery,
} from '../data/mockData'

const CURRENT_STUDENT = 's1'

const tabs = [
  { id: 'lectures', label: 'Lectures', icon: Video },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'grades', label: 'Grades', icon: Award },
  { id: 'graph', label: 'Graph Assignments', icon: GitBranch },
]

const StudentCourse = () => {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('lectures')
  const course = getCourseById(courseId)

  if (!course) {
    return (
      <MockLayout role="student" breadcrumbs={[{ label: 'Dashboard', to: '/mockup/student' }, { label: 'Not Found' }]}>
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <p className="text-forest-light-gray">Course not found.</p>
        </div>
      </MockLayout>
    )
  }

  const courseLectures = lectures[courseId] || []
  const courseFiles = files[courseId] || []
  const courseGrades = grades[courseId] || []
  const courseAssignments = graphAssignments[courseId] || []

  const getAssignmentMastery = (assignmentId) => {
    const nodes = conceptNodes[assignmentId] || []
    const scores = nodes
      .map(n => studentMastery[CURRENT_STUDENT]?.[n.id])
      .filter(s => s !== undefined)
    if (scores.length === 0) return 0
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  }

  const totalGrade = courseGrades.length > 0
    ? Math.round(courseGrades.reduce((a, g) => a + (g.score / g.maxScore) * 100, 0) / courseGrades.length)
    : 0

  return (
    <MockLayout
      role="student"
      breadcrumbs={[
        { label: 'Dashboard', to: '/mockup/student' },
        { label: `${course.code} - ${course.name}` },
      ]}
    >
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12 py-8">
        {/* Course Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-mono text-forest-emerald bg-forest-emerald/10 px-2.5 py-1 rounded">
              {course.code}
            </span>
            <span className="text-sm text-forest-gray">{course.semester}</span>
          </div>
          <h1 className="text-2xl xl:text-3xl font-bold text-white mb-1">{course.name}</h1>
          <p className="text-forest-light-gray">Instructor: {course.instructor}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-forest-card/50 backdrop-blur-sm border border-forest-border/50 rounded-lg p-1 mb-8 w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-forest-emerald/15 text-forest-emerald border border-forest-emerald/30'
                  : 'text-forest-light-gray hover:text-white hover:bg-forest-card/80'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Lectures Tab */}
        {activeTab === 'lectures' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            {courseLectures.map((lec, i) => (
              <div
                key={lec.id}
                className="bg-forest-card/60 border border-forest-border/40 rounded-lg px-5 py-3.5 flex items-center justify-between hover:border-forest-emerald/30 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-forest-emerald/10 flex items-center justify-center">
                    <Video size={18} className="text-forest-emerald" />
                  </div>
                  <div>
                    <p className="text-white font-medium">{lec.title}</p>
                    <p className="text-sm text-forest-gray flex items-center gap-2 mt-0.5">
                      <Calendar size={12} /> {lec.date} &middot; {lec.duration}
                    </p>
                  </div>
                </div>
                {i < 5 && (
                  <span className="text-xs text-forest-emerald bg-forest-emerald/10 px-2 py-1 rounded">
                    Watched
                  </span>
                )}
              </div>
            ))}
          </motion.div>
        )}

        {/* Files Tab */}
        {activeTab === 'files' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            {courseFiles.map(file => (
              <div
                key={file.id}
                className="bg-forest-card/60 border border-forest-border/40 rounded-lg px-5 py-3.5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-forest-gray" />
                  <div>
                    <p className="text-white">{file.name}</p>
                    <p className="text-xs text-forest-gray">{file.size}</p>
                  </div>
                </div>
                <button className="text-forest-gray hover:text-forest-emerald transition-colors">
                  <Download size={16} />
                </button>
              </div>
            ))}
          </motion.div>
        )}

        {/* Grades Tab */}
        {activeTab === 'grades' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="bg-forest-card/60 border border-forest-border/40 rounded-xl p-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-forest-gray">Overall Grade</p>
                <p className="text-3xl font-bold text-white">{totalGrade}%</p>
              </div>
              <div className={`text-sm font-medium px-3 py-1.5 rounded-full ${
                totalGrade >= 90 ? 'bg-emerald-500/10 text-emerald-400' :
                totalGrade >= 80 ? 'bg-blue-500/10 text-blue-400' :
                totalGrade >= 70 ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
              }`}>
                {totalGrade >= 90 ? 'A' : totalGrade >= 80 ? 'B' : totalGrade >= 70 ? 'C' : 'D'}
              </div>
            </div>

            <div className="space-y-2">
              {courseGrades.map(grade => {
                const pct = Math.round((grade.score / grade.maxScore) * 100)
                return (
                  <div key={grade.id} className="bg-forest-card/60 border border-forest-border/40 rounded-lg px-5 py-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {pct >= 70 ? (
                        <CheckCircle size={16} className="text-emerald-400" />
                      ) : (
                        <XCircle size={16} className="text-red-400" />
                      )}
                      <span className="text-white">{grade.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-forest-light-gray text-sm">
                        {grade.score}/{grade.maxScore}
                      </span>
                      <span className={`text-sm font-medium ${
                        pct >= 80 ? 'text-emerald-400' :
                        pct >= 60 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {pct}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Graph Assignments Tab */}
        {activeTab === 'graph' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {courseAssignments.map(assignment => {
              const mastery = getAssignmentMastery(assignment.id)
              return (
                <motion.div
                  key={assignment.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/mockup/student/course/${courseId}/graph/${assignment.id}`)}
                  className="bg-forest-card/70 border border-forest-border hover:border-forest-emerald/40 rounded-xl p-6 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-lg bg-forest-emerald/10 flex items-center justify-center">
                      <GitBranch size={18} className="text-forest-emerald" />
                    </div>
                    <div>
                      <h3 className="text-white font-semibold">{assignment.name}</h3>
                      <p className="text-xs text-forest-gray">
                        {assignment.nodeCount} concepts &middot; Due {assignment.dueDate}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-forest-gray mb-1.5">
                      <span>Mastery Progress</span>
                      <span>{mastery}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-forest-dark rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${mastery}%` }}
                        transition={{ duration: 0.8 }}
                        className="h-full rounded-full"
                        style={{
                          background: `linear-gradient(90deg, #4b5563, #10b981)`,
                          opacity: 0.3 + (mastery / 100) * 0.7,
                        }}
                      />
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </div>
    </MockLayout>
  )
}

export default StudentCourse
