import {it,expect} from "vitest";
import {createRig,restPose,measureRig,validateCharacterConsistency} from "@pixelforge/geometry";
it("validates independent head, torso, attachment and bounding-box observations",()=>{
  const rig=createRig(),pose=restPose(rig),measure=measureRig(rig,pose);
  const frame={frameId:"rest",pose,joints:measure.joints,measurements:measure.measurements,attachments:measure.attachments,bounds:measure.bounds!};
  expect(validateCharacterConsistency(rig,[frame])).toEqual([]);
  const changed=structuredClone(frame);changed.measurements.headWidth!+=2;changed.measurements.torsoLength!+=3;changed.attachments.blade![0]+=5;changed.bounds.max[0]+=4;
  const constraints=validateCharacterConsistency(rig,[changed]).map(d=>d.constraint);
  expect(constraints).toContain("head-size");expect(constraints).toContain("torso-proportion");expect(constraints).toContain("attachment-position");expect(constraints).toContain("character-bounds");
});
