/**
 * Creative format classification: Static vs UGC vs EGC vs Motion.
 *
 * Naming convention (configurable):
 *   - No video                                -> static (image / link card)
 *   - Video whose name contains "short video" -> motion (short-form motion ads)
 *   - Video whose name matches EGC_MATCH      -> egc    (employee-generated content)
 *   - Any other video                         -> ugc    (external creator video)
 *
 * Adjust SHORT_VIDEO_MATCH / EGC_MATCH to fit your own ad-naming conventions.
 */
import type { CreativeFormat, CreativeRow } from './types.ts';

export const SHORT_VIDEO_MATCH = 'short video';

/**
 * Name tokens that mark a video as employee-generated content (a teammate on
 * camera). Matched case-insensitively against the full ad name. Empty by
 * default — add the creator name/handle tokens your account uses, e.g.
 * ['jane-doe', 'jdoe'].
 */
export const EGC_MATCH: string[] = [];

export function classifyFormat(row: Pick<CreativeRow, 'objectType' | 'videoId' | 'adName'>): CreativeFormat {
  const isVideo = !!row.videoId || row.objectType === 'VIDEO';
  if (!isVideo) return 'static';
  const name = row.adName.toLowerCase();
  if (name.includes(SHORT_VIDEO_MATCH)) return 'motion';
  if (EGC_MATCH.some((t) => name.includes(t))) return 'egc';
  return 'ugc';
}

/** True for formats that render as playable video. */
export const isVideoFormat = (f: CreativeFormat): boolean => f === 'ugc' || f === 'motion' || f === 'egc';

export const FORMAT_META: Record<CreativeFormat, { label: string; description: string }> = {
  ugc: { label: 'UGC', description: 'External creator video creatives' },
  egc: { label: 'EGC', description: 'Employee-generated video (internal team on camera)' },
  static: { label: 'Static', description: 'Image and link-card creatives' },
  motion: { label: 'Motion', description: 'Short-form motion ads ("Short video")' },
};
