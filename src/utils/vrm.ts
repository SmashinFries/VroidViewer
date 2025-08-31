import { VRM0Meta, VRM1Meta } from '@pixiv/three-vrm';

export const getVrmMeta = (userData: any) => {
	if (userData.gltfExtensions.VRMC_vrm) {
		// VRM 1
		const meta = userData.gltfExtensions.VRMC_vrm.meta as VRM1Meta;
		return {
			...meta,
			metaVersion: "1",
		} as VRM1Meta;
	} else {
		// VRM 0
		const meta = userData.gltfExtensions.VRM.meta as VRM0Meta;
		return {
			...meta,
			metaVersion: "0",
		} as VRM0Meta;
	}

};