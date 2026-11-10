// SYNTHETIC contract fixtures, NOT recorded server streams.
// Replace/verify against backend recordings before claiming server replay coverage.
export const focus = { video_id: 'lesson-1', title: 'First lesson' };
export const source = {
  id: 'segment-1', video_id: 'lesson-2', title: 'Second lesson', text: 'Library excerpt',
  timestamp: 94, timestamp_end: 131, playback_id: 'playback-2',
};
// These two IDs collide under naive snake_case camelization.
export const citationMap = { c_a1b2: source, cA1b2: { ...source, timestamp: 132 } };
export const pointer = {
  video_id: 'lesson-2', title: 'Second lesson', collection_id: 'owned-course',
  canonical_url: 'https://example.com/lessons/second',
  moments: [{ timestamp: 94, timestamp_end: 131, timestamp_url: 'https://example.com/lessons/second?t=94' }],
};
export const lockedMatch = {
  offer: 'membership_key', collection_ids: ['members-only'], video_count: 2,
  titles: ['Third lesson', 'Fourth lesson'],
};

const start = [
  { type: 'message_start' },
  { type: 'conversation_created', conversation_id: 'thread-1' },
  { type: 'progress', stage: 'reading', message: 'Reading First lesson…', scope: 'focus' },
];

function turn(answeredFrom, content, extraEvents, result) {
  const scope = {
    answered_from: answeredFrom, widened_from: answeredFrom === 'focus' ? null : 'focus',
    reason: answeredFrom === 'focus' ? null : 'not_covered', focus,
  };
  return [
    ...start,
    ...(answeredFrom === 'focus' ? [] : [
      { type: 'progress', stage: 'widening', message: 'Searching your library…', scope: 'library' },
      { type: 'progress', stage: 'planning', message: 'Planning…', scope: 'library' },
      { type: 'progress', stage: 'searching', message: 'Searching…', scope: 'library' },
    ]),
    { type: 'scope', ...scope },
    ...(answeredFrom === 'library' ? [
      { type: 'progress', stage: 'synthesizing', message: 'Writing…', scope: 'library' },
      { type: 'sources', sources: [source] },
      { type: 'citation_map', citation_map: citationMap },
    ] : []),
    { type: 'text_delta', delta: content },
    ...extraEvents,
    { type: 'message_complete', conversation_id: 'thread-1', content, scope, ...result },
  ];
}

export const turns = {
  covered: turn('focus', 'See [01:34].', [], { sources: [{ video_id: 'lesson-1', timestamp: 94 }] }),
  widened: turn('library', 'See [c_a1b2].', [
    { type: 'answer', content: 'See [c_a1b2].', sources: [source], citation_map: citationMap },
  ], { sources: [source], citation_map: citationMap }),
  pointers: turn('none', 'This lesson does not cover it.', [
    { type: 'pointers', pointers: [pointer] },
  ], { sources: [], pointers: [pointer] }),
  locked: turn('none', 'This lesson does not cover it.', [
    { type: 'locked_matches', locked_matches: [lockedMatch] },
  ], { sources: [], locked_matches: [lockedMatch] }),
};
