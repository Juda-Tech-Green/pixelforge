import {describe,it,expect} from "vitest";
import {add,sub,dot,length,normalize,affine,compose,inverse,transform,rasterRound,interpolateAngle,solveTwoBone,cameraSchema,projectPoint,unprojectPoint,projectBounds} from "@pixelforge/geometry";

describe("geometry coordinate and projection contract",()=>{
  it("implements finite vectors and one-time raster rounding",()=>{
    expect(add([1,2],[3,4])).toEqual([4,6]);expect(sub([4,6],[1,2])).toEqual([3,4]);
    expect(dot([1,2],[3,4])).toBe(11);expect(length([3,4])).toBe(5);
    expect(normalize([3,4])[0]).toBeCloseTo(.6,12);expect(normalize([3,4])[1]).toBeCloseTo(.8,12);expect(()=>normalize([0,0])).toThrow();
    expect([-.5,.5,1.49,-1.5].map(rasterRound)).toEqual([0,1,1,-1]);
    expect(()=>add([NaN,0],[0,0])).toThrow();
  });
  it("composes parent transforms and reverses them without intermediate rounding",()=>{
    const parent=affine([10,20],Math.PI/2),child=affine([4,0],0,[2,3]);
    const combined=compose(parent,child),point=transform([1,2],combined);
    expect(point[0]).toBeCloseTo(4,12);expect(point[1]).toBeCloseTo(26,12);
    const local=transform(point,inverse(combined));expect(local[0]).toBeCloseTo(1,12);expect(local[1]).toBeCloseTo(2,12);
    expect(()=>inverse([1,2,2,4,0,0])).toThrow(/singular/);expect(()=>affine([0,0],0,[0,1])).toThrow(/Scale/);
  });
  it("interpolates the short angular arc across the wrap",()=>{
    expect(Math.abs(interpolateAngle(170*Math.PI/180,-170*Math.PI/180,.5))).toBeCloseTo(Math.PI,12);
  });
  it("projects side, top and configurable three-quarter axes",()=>{
    const side=cameraSchema.parse({projection:"side-view",origin:[10,20],scale:2});
    expect(projectPoint([3,7,4],side)).toEqual([16,12]);
    expect(unprojectPoint([16,12],side,{axis:"y",value:7})).toEqual([3,7,4]);
    expect(()=>unprojectPoint([16,12],side)).toThrow(/not invertible/);
    const top=cameraSchema.parse({projection:"top-down"});expect(projectPoint([3,7,4],top)).toEqual([3,7]);
    expect(unprojectPoint([3,7],top,{axis:"z",value:4})).toEqual([3,7,4]);
    const quarter=cameraSchema.parse({projection:"three-quarter",origin:[100,50]});
    expect(projectPoint([10,4,3],quarter)).toEqual([106,54]);
    expect(unprojectPoint([106,54],quarter,{axis:"z",value:3})).toEqual([10,4,3]);
    const bounds=projectBounds([0,0,0],[4,6,8],quarter);expect(bounds).toEqual({min:[94,42],max:[104,55]});
  });
  it("rejects degenerate custom projection planes",()=>{
    expect(()=>cameraSchema.parse({projection:"three-quarter",axes:[[1,1],[2,2],[3,3]]})).toThrow(/span/);
  });
});

describe("two-bone inverse kinematics",()=>{
  it("solves a known reachable target with both bend directions",()=>{
    for(const bend of [1,-1] as const){const r=solveTwoBone([0,0],[6,0],5,5,bend);
      expect(r.middle).toEqual([3,4*bend]);expect(r.end).toEqual([6,0]);expect(r.reachable).toBe(true);expect(r.error).toBe(0);}
  });
  it("clamps far and near unreachable targets, reporting exact residual",()=>{
    const far=solveTwoBone([0,0],[20,0],5,3);expect(far.end).toEqual([8,0]);expect(far.error).toBe(12);
    const near=solveTwoBone([0,0],[.5,0],5,3);expect(near.end).toEqual([2,0]);expect(near.error).toBe(1.5);
    expect(length(sub(near.middle,near.root))).toBeCloseTo(5,12);expect(length(sub(near.end,near.middle))).toBeCloseTo(3,12);
  });
  it("handles coincident targets, left-facing targets and degenerate lengths",()=>{
    const folded=solveTwoBone([2,3],[2,3],5,5);expect(folded.end).toEqual([2,3]);expect(length(sub(folded.middle,folded.root))).toBe(5);
    const left=solveTwoBone([0,0],[-6,0],5,5,-1);expect(left.middle).toEqual([-3,4]);
    expect(()=>solveTwoBone([0,0],[1,1],0,1)).toThrow(/length/);
    expect(()=>solveTwoBone([0,0],[Infinity,1],1,1)).toThrow();
  });
});
