# Methodology

Direct condition was written and saved first, from the supplied rig and scene JSON only. World positions used ordinary hierarchical addition and my own circle-intersection arithmetic for fixed-length two-segment limbs. Both ankle targets remain at rest coordinates; hands and feet follow the final segment rotation. The left arm retains its rest pose. The full order was chosen using depth groups, render layers, requested occlusion and stable IDs.

Geometry condition used actual source API schema discovery, parsePoses, applyPose, parseScene and depthOrder through tsx. It stores root translations plus right-wrist and two ankle IK targets. Table part dependencies were added without changing any scene geometry, camera or transforms.

Geometry API complete order: wall, floor, chair, door, handle, table:rear, character, table:front, table:left-leg, table:right-leg, foreground-crate.

Only these four requested output files were written. No evaluator was run, no evaluator metrics were viewed, and no post-evaluation revisions were made. No visual/aesthetic rating is claimed; this single specification cannot establish general cross-model artistic superiority.
