export const MVP_PHASES = {
  ENTRY: 'entry',
  DIAGNOSTIC_NOTICE: 'diagnostic_notice',
  GUIDED_WATER: 'guided_water',
  FREEFORM_AIRPLANE: 'freeform_airplane',
  ASSESSMENT: 'assessment',
  SURVEY: 'survey',
  SUMMARY: 'summary',
}

export const WATER_CURRICULUM = [
  {
    key: 'water-contaminants',
    title: 'Contaminant Types',
    kicker: 'Node 1',
    x: 180,
    y: 300,
    parentIds: [],
    summary: 'Recognize that unsafe water can contain different kinds of contaminants, not just one kind of problem.',
    openingPrompt: 'Imagine two cups of unsafe water: one looks muddy, while the other looks clear but still might make you sick. What kinds of contaminants could be present across those two cases?',
    lowEffortTeaching: 'Here is the core idea: unsafe water can contain **visible suspended particles** like dirt or sediment, but it can also contain **invisible contaminants** like microorganisms or dissolved chemicals. A filtration system matters because different contaminant types often require different treatment approaches.',
    lowEffortHint: 'Start by separating contaminants into broad categories: things you can often see versus things mixed into the water that you usually cannot see.',
    lowEffortExample: 'Example: muddy water may contain sand or silt, while clear-looking water could still contain bacteria, viruses, or dissolved chemicals.',
    lowEffortPrompt: 'Using those categories, can you now name two different kinds of contaminants and explain why one filter method may not be enough?',
    explanation: `Water can be unsafe for more than one reason. Some contaminants are suspended particles you can sometimes see, like dirt, sand, rust, or sediment. Others are much harder to notice directly, such as microorganisms or dissolved chemicals.\n\nThis matters because a good filtration system is not solving one single problem. It is dealing with different categories of contamination, and that is why multiple treatment ideas are often needed.`,
    question: 'What broad categories of contaminants can make untreated water unsafe, and why does that matter for filtration?',
    masteryGoals: [
      'State that untreated water can be unsafe or harmful to drink.',
      'Identify suspended or visible particle contamination such as dirt, sand, rust, or sediment.',
      'Identify less visible contamination such as microorganisms, pathogens, dissolved chemicals, or heavy metals.',
      'Explain that different contaminant types matter because filtration may need different treatment approaches.',
    ],
  },
  {
    key: 'water-sediment-filtration',
    title: 'Mechanical Separation',
    kicker: 'Node 2',
    x: 70,
    y: 150,
    parentIds: [],
    summary: 'Understand the underlying idea of filtering by size or physical blockage.',
    openingPrompt: 'Think about a kitchen strainer or sieve. What kinds of things can it catch well, and what kinds of things would still pass through?',
    lowEffortTeaching: 'Here is the key idea: **mechanical filtration** removes contaminants by physically blocking larger particles. It works well for suspended solids like sand, silt, rust, or debris, but it does not automatically remove dissolved substances that are mixed into the water.',
    lowEffortHint: 'Think in terms of size: what gets stopped by a screen, and what is small enough or dissolved enough to keep moving through?',
    lowEffortExample: 'Example: a strainer can catch pasta or rice, but salt dissolved in water passes right through because it is no longer present as big separate pieces.',
    lowEffortPrompt: 'Can you explain why a filter that catches dirt and sediment might still fail to remove dissolved chemicals?',
    explanation: `One core filtration idea is mechanical separation: a barrier or medium physically blocks particles that are larger than what can pass through it. In water treatment, that makes this approach useful for suspended solids such as sand, silt, rust, or debris.\n\nIts limitation is just as important as its strength. If a contaminant is dissolved in the water, or is much smaller than the filter is designed for, simple size-based filtering may not remove it effectively.`,
    question: 'What kinds of contaminants can mechanical filtration remove well, and why can’t it solve every water-quality problem by itself?',
    masteryGoals: [
      'Describe mechanical filtration as physical or size-based separation.',
      'State that it works well for larger suspended particles such as sand, silt, rust, debris, or sediment.',
      'Explain that dissolved substances or some very small contaminants may still pass through.',
      'Connect this limitation to why additional treatment methods may still be needed.',
    ],
  },
  {
    key: 'water-activated-carbon',
    title: 'Adsorption',
    kicker: 'Node 3',
    x: 290,
    y: 150,
    parentIds: [],
    summary: 'Learn the idea that some contaminants are reduced by sticking to a material’s surface rather than being screened out by size.',
    openingPrompt: 'Suppose water no longer looks muddy, but it still smells odd or contains dissolved substances. What kind of mechanism would need to happen to reduce something that is mixed into the water rather than floating visibly in it?',
    lowEffortTeaching: 'Here is the key idea: **adsorption** means certain contaminants stick to the surface of a material instead of just being blocked by a screen. In water filtration, activated carbon is useful because dissolved chemicals or odor-causing compounds can attach to its surface.',
    lowEffortHint: 'Focus on the difference between **being physically screened out** and **sticking to a surface**.',
    lowEffortExample: 'Example: a dissolved odor-causing chemical is not a large visible particle, so a simple screen may miss it, but it can be captured if it adheres to activated carbon.',
    lowEffortPrompt: 'Can you now explain in your own words how adsorption is different from mechanical filtration?',
    explanation: `Another important treatment concept is adsorption. Instead of acting like a screen, a material such as activated carbon provides a large surface that certain dissolved molecules can stick to.\n\nThis makes adsorption especially useful for reducing some chemicals, chlorine-related taste and odor issues, and other dissolved compounds. Conceptually, this is different from mechanical separation: the contaminant is being captured at a surface, not merely blocked because it is too large to fit through.`,
    question: 'How does adsorption help remove some dissolved contaminants, and how is that different from mechanical filtration?',
    masteryGoals: [
      'Explain adsorption as contaminants sticking to or being captured on a surface rather than screened out by size.',
      'Mention that this is useful for some dissolved chemicals, chlorine, or taste and odor compounds.',
      'Contrast adsorption with mechanical filtration or particle screening.',
      'Recognize that different mechanisms target different contaminant types.',
    ],
  },
  {
    key: 'water-system-flow',
    title: 'System Integration',
    kicker: 'Node 4',
    x: 180,
    y: 48,
    parentIds: ['water-contaminants', 'water-sediment-filtration', 'water-activated-carbon'],
    summary: 'Combine the prerequisite concepts into one bigger explanation of why a multi-stage filtration system works.',
    openingPrompt: 'Now combine the ideas: if water can contain different contaminant types, and different mechanisms target different problems, how would you explain why a multi-stage filtration system is designed the way it is?',
    lowEffortTeaching: 'Here is the bigger picture: a water filtration system uses **multiple stages** because one method does not solve every contamination problem. Mechanical filtration helps with larger suspended particles, while adsorption helps with some dissolved substances, so the full system combines different mechanisms to improve overall cleaning.',
    lowEffortHint: 'Tie each contaminant type to a treatment mechanism, then explain why combining those mechanisms works better than using only one.',
    lowEffortExample: 'Example: an early filter may remove sediment and protect later stages, while activated carbon later reduces dissolved chemicals or odor-causing compounds.',
    lowEffortPrompt: 'Using that idea, can you explain why combining stages makes the system more effective than using only one filter type?',
    explanation: `A water filtration system works as an integrated design, not as one magical step. Different contaminant types call for different treatment mechanisms, so the system combines multiple ideas into one process.\n\nIn practice, larger suspended particles are usually handled before later treatments aimed at dissolved substances. The ordering matters because earlier steps reduce load on later ones, and the overall system works better when each stage targets the kind of contamination it is best suited to handle.`,
    question: 'Why does a water filtration system use multiple stages, and how do the different concepts fit together into one coherent design?',
    masteryGoals: [
      'Explain that water filtration is multi-stage because one method does not address every contaminant type.',
      'Connect contaminant categories to different treatment mechanisms.',
      'State that mechanical separation is useful for larger suspended particles.',
      'State that adsorption is useful for some dissolved substances.',
      'Explain why combining or ordering stages improves overall system performance.',
    ],
  },
]

export const ASSESSMENT_QUESTIONS = [
  {
    key: 'water-q1',
    topic: 'water filtration',
    prompt: 'A filter system handles muddy water first and then uses activated carbon later. What is the best explanation for that ordering?',
    options: [
      'Mechanical filtration removes larger suspended particles first, which helps later treatment focus on dissolved contaminants.',
      'Activated carbon must always come second because it only works after water has been heated.',
      'The first stage is mainly to add chlorine, while activated carbon is used to increase water pressure.',
      'The order does not matter as long as both stages are present somewhere in the system.',
    ],
    correctOption: 'Mechanical filtration removes larger suspended particles first, which helps later treatment focus on dissolved contaminants.',
  },
  {
    key: 'water-q2',
    topic: 'water filtration',
    prompt: 'Why can a simple screen or sediment filter fail to make water fully safe even if the water looks clear afterward?',
    options: [
      'Because some contaminants are dissolved or microscopic, so they are not removed just by blocking larger particles.',
      'Because screens only work when water is moving very slowly through the pipe.',
      'Because sediment filters are designed mainly to raise water temperature before later stages.',
      'Because clear water can never contain harmful substances once visible particles are gone.',
    ],
    correctOption: 'Because some contaminants are dissolved or microscopic, so they are not removed just by blocking larger particles.',
  },
  {
    key: 'water-q3',
    topic: 'water filtration',
    prompt: 'A sample of water contains both sand and a chlorine-like taste. Why is a multi-stage system more appropriate than a single sediment filter?',
    options: [
      'Because the sand and the taste-causing compounds are different kinds of problems that may require different removal mechanisms.',
      'Because chlorine-like tastes can only be removed by boiling after sediment filtration.',
      'Because sand prevents all other filter media from working unless the water is fully distilled first.',
      'Because any filter that removes visible particles automatically removes dissolved taste-causing substances too.',
    ],
    correctOption: 'Because the sand and the taste-causing compounds are different kinds of problems that may require different removal mechanisms.',
  },
  {
    key: 'water-q4',
    topic: 'water filtration',
    prompt: 'What best distinguishes adsorption from mechanical filtration in a water treatment system?',
    options: [
      'Adsorption captures some contaminants by letting them stick to a surface, while mechanical filtration mainly blocks particles by size.',
      'Adsorption works only on visible contaminants, while mechanical filtration works only on invisible ones.',
      'Adsorption increases water pressure, while mechanical filtration changes the water temperature.',
      'Adsorption and mechanical filtration are the same process with different names.',
    ],
    correctOption: 'Adsorption captures some contaminants by letting them stick to a surface, while mechanical filtration mainly blocks particles by size.',
  },
  {
    key: 'airplane-q1',
    topic: 'airplane engines',
    prompt: 'Why is the compressor important before combustion in a jet engine?',
    options: [
      'It raises the pressure of incoming air so combustion can happen more effectively.',
      'It cools the exhaust so the airplane can create lift.',
      'It stores compressed fuel for the turbine to burn later.',
      'It removes thrust from the exhaust so the engine does not overheat.',
    ],
    correctOption: 'It raises the pressure of incoming air so combustion can happen more effectively.',
  },
  {
    key: 'airplane-q2',
    topic: 'airplane engines',
    prompt: 'What best explains how the main stages of a jet engine work together to produce thrust?',
    options: [
      'Air is compressed, mixed with fuel and burned, some energy drives the turbine, and the remaining fast-moving exhaust is pushed backward to create thrust.',
      'Fuel is burned first, then the compressor cools it, and the wings convert the cooled air into thrust.',
      'The turbine pulls the airplane forward directly, while exhaust is mainly used to cool the engine.',
      'The engine creates thrust mostly by storing pressure inside the combustion chamber until takeoff.',
    ],
    correctOption: 'Air is compressed, mixed with fuel and burned, some energy drives the turbine, and the remaining fast-moving exhaust is pushed backward to create thrust.',
  },
  {
    key: 'airplane-q3',
    topic: 'airplane engines',
    prompt: 'Why doesn’t all the energy from combustion go directly into forward thrust?',
    options: [
      'Because some of that energy must first turn the turbine, which helps power earlier engine stages like the compressor.',
      'Because the combustion chamber stores most of the energy for use during landing instead of flight.',
      'Because the engine sends the hottest gases into the wings before producing thrust.',
      'Because only the fuel, not the airflow, contributes to thrust in a jet engine.',
    ],
    correctOption: 'Because some of that energy must first turn the turbine, which helps power earlier engine stages like the compressor.',
  },
  {
    key: 'airplane-q4',
    topic: 'airplane engines',
    prompt: 'What is the most accurate reason a jet engine can keep producing thrust continuously during flight?',
    options: [
      'It continually draws in air, compresses it, burns fuel with it, and expels exhaust backward in an ongoing cycle.',
      'It stores all needed compressed air before takeoff and releases it gradually during flight.',
      'It produces thrust only when the airplane is already moving fast enough for the wings to push air into the turbine.',
      'It alternates between thrust mode and cooling mode every few seconds.',
    ],
    correctOption: 'It continually draws in air, compresses it, burns fuel with it, and expels exhaust backward in an ongoing cycle.',
  },
]

export const SURVEY_FIELDS = [
  {
    key: 'clarityRating',
    label: 'The learning experience provided a clear explanation of complex concepts (Clarity)',
  },
  {
    key: 'engagementRating',
    label: 'I felt engaged and motivated to continue learning throughout the experience (Engagement)',
  },
  {
    key: 'effectivenessRating',
    label: 'The system effectively supported my learning and retention of the material (Effectiveness)',
  },
]

export const CONFIDENCE_OPTIONS = [1, 2, 3, 4, 5]
export const RATING_OPTIONS = [1, 2, 3, 4, 5]
export const RATING_LABELS = {
  1: '1 (Strongly Disagree)',
  2: '2',
  3: '3 (Neutral)',
  4: '4 (Agree)',
  5: '5 (Strongly Agree)',
}
export const CONFIDENCE_LABELS = {
  1: '1 (Not confident at all)',
  2: '2',
  3: '3',
  4: '4',
  5: '5 (Very confident)',
}
export const CLEARER_SYSTEM_OPTIONS = [
  'Guided Diagnostic System',
  'Free-Form AI Learning Experience',
  'Both were equally clear',
]
export const PREFERRED_SYSTEM_OPTIONS = [
  'Guided Diagnostic System (Structured progression)',
  'Free-Form AI Learning Experience (Open-ended interaction)',
  'Both equally',
  'I have no preference',
]

export const AIRPLANE_INTRO_MESSAGE = `You are now in the free-form AI phase.\n\nYour goal is to learn **how an airplane engine works** in the same amount of time it took you to complete the guided water-filtration mastery flow. Ask whatever you want, and use the timer as your limit.`

export const createInitialNodeState = () =>
  WATER_CURRICULUM.map((node, index) => ({
    key: node.key,
    status: node.parentIds.length === 0 ? 'active' : 'locked',
    masteryScore: 0,
    attemptCount: 0,
    interactionCount: 0,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    lastAnswer: '',
    draftAnswer: '',
    feedback: '',
    hintUnlocked: false,
    messages: [],
  }))
