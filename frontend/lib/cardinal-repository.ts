import type { Achievement, AnalyticsStudent, CardinalRepository, Course, Mission, SkillNode, UserProfile } from './cardinal-domain'

const user: UserProfile = { id: 'usr_01', name: 'Alex Rivera', email: 'alex.rivera@mymail.mapua.edu.ph', studentNumber: '2023-10482', program: 'BS Computer Science', yearLevel: 2, role: 'student', level: 12, xp: 2840, xpToNextLevel: 3200, streakDays: 9 }

const courses: Course[] = [
  { id: 'crs_cs210', code: 'CS210', title: 'Data Structures & Algorithms', term: '2Q AY 2026–27', instructor: 'Prof. Mara Santos', progress: 68, masteredSkills: 6, totalSkills: 16 },
  { id: 'crs_cs230', code: 'CS230', title: 'Database Systems', term: '2Q AY 2026–27', instructor: 'Engr. Luis Flores', progress: 42, masteredSkills: 4, totalSkills: 12 },
  { id: 'crs_cs240', code: 'CS240', title: 'Computer Networks', term: '2Q AY 2026–27', instructor: 'Dr. Nina Cruz', progress: 31, masteredSkills: 3, totalSkills: 14 },
]

const names = ['Computational Thinking','Programming Foundations','Discrete Structures','Linear Data Structures','Recursion','Sorting & Searching','Trees','Hashing','Graph Theory','Algorithm Analysis','Dynamic Programming','Greedy Algorithms','Advanced Trees','Graph Algorithms','Optimization','Capstone Mastery']
const positions = [{x:50,y:90},{x:25,y:195},{x:75,y:195},{x:15,y:315},{x:40,y:315},{x:65,y:315},{x:88,y:315},{x:22,y:440},{x:48,y:440},{x:76,y:440},{x:12,y:565},{x:36,y:565},{x:62,y:565},{x:87,y:565},{x:35,y:690},{x:68,y:690}]
const icons: SkillNode['icon'][] = ['brain','code','terminal','database','code','terminal','database','shield','network','brain','code','terminal','database','network','shield','brain']
const skills: SkillNode[] = names.map((title, index) => ({ id: `skill_${index+1}`, courseId: 'crs_cs210', title, shortTitle: title.split(' ').slice(0,2).join(' '), description: `Build a practical command of ${title.toLowerCase()} through guided challenges and applied work.`, status: index < 6 ? 'mastered' : index < 9 ? 'active' : index < 12 ? 'available' : 'locked', progress: index < 6 ? 100 : index < 9 ? [72,48,25][index-6] : 0, xpReward: 180 + index * 20, position: positions[index], prerequisites: index === 0 ? [] : [`skill_${Math.max(1, index-2)}`], missionIds: [`mission_${index+1}`], icon: icons[index] }))

const missions: Mission[] = names.slice(0,12).map((name,index) => ({ id:`mission_${index+1}`, skillId:`skill_${index+1}`, title:index === 6 ? 'Binary Search Tree Expedition' : `${name} Challenge`, description:`Complete an applied ${index % 3 === 0 ? 'lab' : 'assessment'} to demonstrate your understanding of ${name.toLowerCase()}.`, type:index % 4 === 0 ? 'lab' : index % 4 === 1 ? 'quiz' : index % 4 === 2 ? 'project' : 'reflection', difficulty:index < 4 ? 'Foundational' : index < 9 ? 'Intermediate' : 'Advanced', durationMinutes:20 + index*5, xpReward:100 + index*25, status:index < 5 ? 'completed' : index < 8 ? 'in-progress' : index < 11 ? 'available' : 'locked', dueAt:index < 5 ? null : `2026-08-${String(12+index).padStart(2,'0')}T17:00:00.000Z` }))

const achievements: Achievement[] = [
  {id:'ach_1',title:'First Spark',description:'Master your first academic skill.',unlockedAt:'2026-06-08T10:00:00.000Z',rarity:'common'},
  {id:'ach_2',title:'Nine-Day Flame',description:'Maintain a nine-day learning streak.',unlockedAt:'2026-08-03T09:00:00.000Z',rarity:'rare'},
  {id:'ach_3',title:'Tree Whisperer',description:'Master every tree data structure skill.',unlockedAt:null,rarity:'epic'},
  {id:'ach_4',title:'Peer Beacon',description:'Help three classmates through a challenge.',unlockedAt:null,rarity:'rare'},
]

const analytics: AnalyticsStudent[] = ['Alex Rivera','Bianca Lim','Carlos Mendoza','Diane Uy','Elijah Tan','Fatima Reyes'].map((name,i)=>({id:`student_${i+1}`,name,progress:[68,82,39,74,91,51][i],mastered:[6,8,3,7,10,4][i],streak:[9,12,2,7,18,4][i],status:i===2||i===5?'needs-support':i===4?'excelling':'on-track'}))

const delay = <T,>(value:T) => new Promise<T>((resolve)=>setTimeout(()=>resolve(structuredClone(value)),120))
export const cardinalRepository: CardinalRepository = {
  getCurrentUser:()=>delay(user), getCourses:()=>delay(courses), getSkills:()=>delay(skills), getMissions:()=>delay(missions), getAchievements:()=>delay(achievements), getInstructorAnalytics:()=>delay(analytics), updateMissionStatus:()=>delay({ok:true as const})
}
export const prototypeData = { user, courses, skills, missions, achievements, analytics }
