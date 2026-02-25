import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  FileText, BarChart3, GitBranch, Users, Calendar, Download,
  AlertTriangle, TrendingUp, TrendingDown, Video,
} from 'lucide-react'
import MockLayout from '../MockLayout'
import CourseGraph from './CourseGraph'
import {
  getCourseById, lectures, files, students, studentMastery,
  getClassMastery, conceptNodes, graphAssignments,
} from '../data/mockData'

const tabs = [
  { id: 'content', label: 'Content', icon: FileText },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'graph', label: 'Concept Graph', icon: GitBranch },
  { id: 'people', label: 'People', icon: Users },
]

const TeacherCourse = () => {
  const { courseId } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('content')
  const course = getCourseById(courseId)

  if (!course) {
    return (
      <MockLayout role="teacher" breadcrumbs={[{ label: 'Dashboard', to: '/mockup/teacher' }, { label: 'Not Found' }]}>
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <p className="text-forest-light-gray text-lg">Course not found.</p>
        </div>
      </MockLayout>
    )
  }

  const courseLectures = lectures[courseId] || []
  const courseFiles = files[courseId] || []
  const courseStudents = students.filter(s => course.studentIds.includes(s.id))
  const courseAssignments = graphAssignments[courseId] || []

  const allNodes = courseAssignments.flatMap(a => (conceptNodes[a.id] || []).map(n => ({ ...n, assignmentId: a.id })))
  const nodeAnalytics = allNodes.map(n => ({
    ...n,
    mastery: getClassMastery(n.id, courseId),
  }))

  const getStudentOverallMastery = (studentId) => {
    const scores = allNodes
      .map(n => studentMastery[studentId]?.[n.id])
      .filter(s => s !== undefined)
    if (scores.length === 0) return 0
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  }

  return (
    <MockLayout
      role="teacher"
      breadcrumbs={[
        { label: 'Dashboard', to: '/mockup/teacher' },
        { label: `${course.code} - ${course.name}` },
      ]}
    >
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12 py-8">
        {/* Course Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-mono text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded">
              {course.code}
            </span>
            <span className="text-sm text-forest-gray">{course.semester}</span>
          </div>
          <h1 className="text-2xl xl:text-3xl font-bold text-white mb-1">{course.name}</h1>
          <p className="text-forest-light-gray">{course.description}</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-forest-card/50 backdrop-blur-sm border border-forest-border/50 rounded-lg p-1 mb-8 w-fit">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-amber-400/15 text-amber-400 border border-amber-400/30'
                  : 'text-forest-light-gray hover:text-white hover:bg-forest-card/80'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Tab */}
        {activeTab === 'content' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            {/* Lectures */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Video size={18} className="text-amber-400" />
                Lectures
              </h2>
              <div className="space-y-2">
                {courseLectures.map(lec => (
                  <div key={lec.id} className="bg-forest-card/60 border border-forest-border/40 rounded-lg px-5 py-3.5 flex items-center justify-between">
                    <div>
                      <p className="text-white font-medium">{lec.title}</p>
                      <p className="text-sm text-forest-gray flex items-center gap-2 mt-0.5">
                        <Calendar size={12} /> {lec.date} &middot; {lec.duration}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Files */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <FileText size={18} className="text-amber-400" />
                Files
              </h2>
              <div className="space-y-2">
                {courseFiles.map(file => (
                  <div key={file.id} className="bg-forest-card/60 border border-forest-border/40 rounded-lg px-5 py-3.5 flex items-center justify-between">
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
              </div>
            </div>
          </motion.div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  label: 'Students',
                  value: courseStudents.length,
                  icon: Users,
                },
                {
                  label: 'Concepts Tracked',
                  value: allNodes.length,
                  icon: GitBranch,
                },
                {
                  label: 'Avg Mastery',
                  value: `${nodeAnalytics.length > 0 ? Math.round(nodeAnalytics.reduce((a, n) => a + n.mastery, 0) / nodeAnalytics.length) : 0}%`,
                  icon: BarChart3,
                },
              ].map(stat => (
                <div key={stat.label} className="bg-forest-card/60 border border-forest-border/40 rounded-xl p-5">
                  <div className="flex items-center gap-2 text-forest-gray text-sm mb-1">
                    <stat.icon size={14} /> {stat.label}
                  </div>
                  <p className="text-2xl font-bold text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Per-Concept Mastery */}
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Concept Mastery Breakdown</h2>
              <div className="space-y-3">
                {nodeAnalytics
                  .sort((a, b) => a.mastery - b.mastery)
                  .map(node => (
                    <div key={node.id} className="bg-forest-card/60 border border-forest-border/40 rounded-lg px-5 py-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {node.mastery < 40 && <AlertTriangle size={14} className="text-red-400" />}
                          <span className="text-white font-medium">{node.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {node.mastery < 50 ? (
                            <TrendingDown size={14} className="text-red-400" />
                          ) : (
                            <TrendingUp size={14} className="text-emerald-400" />
                          )}
                          <span className={`text-sm font-medium ${
                            node.mastery >= 70 ? 'text-emerald-400' :
                            node.mastery >= 40 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {node.mastery}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2 bg-forest-dark rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${node.mastery}%` }}
                          transition={{ duration: 0.6 }}
                          className={`h-full rounded-full ${
                            node.mastery >= 70 ? 'bg-emerald-500' :
                            node.mastery >= 40 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* Graph Tab */}
        {activeTab === 'graph' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <CourseGraph courseId={courseId} />
          </motion.div>
        )}

        {/* People Tab */}
        {activeTab === 'people' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="bg-forest-card/60 border border-forest-border/40 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-forest-border/30 grid grid-cols-12 text-sm font-medium text-forest-gray">
                <div className="col-span-4">Student</div>
                <div className="col-span-3">Email</div>
                <div className="col-span-3">Overall Mastery</div>
                <div className="col-span-2 text-right">Status</div>
              </div>
              {courseStudents.map(student => {
                const mastery = getStudentOverallMastery(student.id)
                return (
                  <div
                    key={student.id}
                    className="px-5 py-4 border-b border-forest-border/20 grid grid-cols-12 items-center hover:bg-forest-card/40 transition-colors"
                  >
                    <div className="col-span-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-forest-border flex items-center justify-center text-sm font-medium text-white">
                          {student.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <span className="text-white font-medium">{student.name}</span>
                      </div>
                    </div>
                    <div className="col-span-3 text-sm text-forest-gray">{student.email}</div>
                    <div className="col-span-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-forest-dark rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${mastery}%` }}
                            transition={{ duration: 0.6 }}
                            className={`h-full rounded-full ${
                              mastery >= 70 ? 'bg-emerald-500' :
                              mastery >= 40 ? 'bg-amber-500' : 'bg-red-500'
                            }`}
                          />
                        </div>
                        <span className="text-sm text-forest-light-gray w-10 text-right">{mastery}%</span>
                      </div>
                    </div>
                    <div className="col-span-2 text-right">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        mastery >= 70
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : mastery >= 40
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}>
                        {mastery >= 70 ? 'On Track' : mastery >= 40 ? 'Needs Help' : 'At Risk'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </div>
    </MockLayout>
  )
}

export default TeacherCourse
