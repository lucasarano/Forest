import React from 'react'
import { useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  HelpCircle, Users, BarChart3, GitBranch, TrendingDown, TrendingUp,
} from 'lucide-react'
import MockLayout from '../MockLayout'
import {
  getNodeById, getCourseById, getClassMastery, getTeacherNodeColor,
  nodeQuestions, subConcepts, students, studentMastery,
} from '../data/mockData'

const NodeDetail = () => {
  const { courseId, nodeId } = useParams()
  const course = getCourseById(courseId)
  const node = getNodeById(nodeId)

  if (!course || !node) {
    return (
      <MockLayout role="teacher" breadcrumbs={[{ label: 'Dashboard', to: '/mockup/teacher' }, { label: 'Not Found' }]}>
        <div className="max-w-7xl mx-auto px-6 py-16 text-center">
          <p className="text-forest-light-gray">Node not found.</p>
        </div>
      </MockLayout>
    )
  }

  const classMastery = getClassMastery(nodeId, courseId)
  const questions = nodeQuestions[nodeId] || []
  const subs = subConcepts[nodeId] || []

  const courseStudents = students.filter(s => course.studentIds.includes(s.id))
  const studentPerformance = courseStudents.map(s => ({
    ...s,
    mastery: studentMastery[s.id]?.[nodeId] ?? 0,
  })).sort((a, b) => a.mastery - b.mastery)

  const color = getTeacherNodeColor(classMastery)

  return (
    <MockLayout
      role="teacher"
      breadcrumbs={[
        { label: 'Dashboard', to: '/mockup/teacher' },
        { label: course.code, to: `/mockup/teacher/course/${courseId}` },
        { label: node.label },
      ]}
    >
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 xl:px-8 2xl:px-12 py-8">
        {/* Node Header */}
        <div className="flex items-start gap-5 mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            {classMastery}%
          </div>
          <div>
            <h1 className="text-2xl xl:text-3xl font-bold text-white">{node.label}</h1>
            <p className="text-forest-light-gray mt-1">
              Class average mastery: <span className="font-semibold" style={{ color }}>{classMastery}%</span>
              {' '}across {courseStudents.length} students
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Student Performance */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-forest-card/60 border border-forest-border/40 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Users size={18} className="text-amber-400" />
                Student Performance
              </h2>
              <div className="space-y-3">
                {studentPerformance.map(s => (
                  <div key={s.id} className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-forest-border flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                      {s.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-white truncate">{s.name}</span>
                        <div className="flex items-center gap-1.5">
                          {s.mastery < 50 ? (
                            <TrendingDown size={12} className="text-red-400" />
                          ) : (
                            <TrendingUp size={12} className="text-emerald-400" />
                          )}
                          <span className={`text-sm font-medium ${
                            s.mastery >= 70 ? 'text-emerald-400' :
                            s.mastery >= 40 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {s.mastery}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1.5 bg-forest-dark rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${s.mastery}%` }}
                          transition={{ duration: 0.5 }}
                          className={`h-full rounded-full ${
                            s.mastery >= 70 ? 'bg-emerald-500' :
                            s.mastery >= 40 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Common Questions */}
            <div className="bg-forest-card/60 border border-forest-border/40 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <HelpCircle size={18} className="text-amber-400" />
                Common Student Questions
              </h2>
              {questions.length > 0 ? (
                <div className="space-y-3">
                  {questions.map((q, i) => (
                    <div key={i} className="flex items-start gap-3 bg-forest-dark/50 rounded-lg px-4 py-3">
                      <span className="text-amber-400 font-medium text-sm mt-0.5">Q{i + 1}</span>
                      <p className="text-forest-light-gray text-sm">{q}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-forest-gray text-sm">No questions recorded yet.</p>
              )}
            </div>
          </div>

          {/* Side Panel - Sub-concepts */}
          <div className="space-y-6">
            <div className="bg-forest-card/60 border border-forest-border/40 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart3 size={18} className="text-amber-400" />
                Quick Stats
              </h2>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-sm text-forest-gray">Highest</span>
                  <span className="text-sm text-emerald-400 font-medium">
                    {studentPerformance.length > 0 ? Math.max(...studentPerformance.map(s => s.mastery)) : 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-forest-gray">Lowest</span>
                  <span className="text-sm text-red-400 font-medium">
                    {studentPerformance.length > 0 ? Math.min(...studentPerformance.map(s => s.mastery)) : 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-forest-gray">Average</span>
                  <span className="text-sm text-white font-medium">{classMastery}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-forest-gray">At Risk (&lt;40%)</span>
                  <span className="text-sm text-red-400 font-medium">
                    {studentPerformance.filter(s => s.mastery < 40).length} students
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-forest-card/60 border border-forest-border/40 rounded-xl p-6">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <GitBranch size={18} className="text-amber-400" />
                Related Sub-Concepts
              </h2>
              {subs.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {subs.map((sub, i) => (
                    <span
                      key={i}
                      className="text-xs bg-forest-dark border border-forest-border px-3 py-1.5 rounded-full text-forest-light-gray"
                    >
                      {sub}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-forest-gray text-sm">No sub-concepts defined.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </MockLayout>
  )
}

export default NodeDetail
