/** World-space height of the frame at the focus plane (z = 0). */
export const FRAME = 10;
/** Camera distance from the focus plane. With FRAME = 10 this gives a ~53° vertical field of view. */
export const CAM_DIST = 10;
/** Where the camera is in a layer's own units while it rests at that layer's stop. */
export const STOP_VIEWPOINT: [number, number, number] = [0, 0, CAM_DIST / (FRAME / 2)];
