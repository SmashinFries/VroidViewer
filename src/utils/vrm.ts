import { VRM0Meta, VRM1Meta, VRMMeta } from '@pixiv/three-vrm';
import { Platform } from 'react-native';
import { Texture } from 'three';
import { GLTFParser } from 'three-stdlib';

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

type VrmThumbnail = {
	data: {
		localUri: string;
	};
	height: number;
	width: number;
}

const arrayBufferToB64 = (arrayBuffer: ArrayBuffer) => {
	const bytes = new Uint8Array(arrayBuffer);
	let binary = '';
	for (let i = 0; i < bytes.length; i += 1000) {
		// @ts-expect-error
		binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 1000));
	}
	return btoa(binary);
}

const getVrm0Thumb = async (parser: GLTFParser,) => {
	const vrmExt = parser.json.extensions?.VRM;
	const schemaMeta = vrmExt.meta;

	if (schemaMeta.texture != null && schemaMeta.texture !== -1) {
		const texture: Texture = await parser.getDependency('texture', schemaMeta.texture);

		if (Platform.OS === 'web') {
			const ocanvas = new OffscreenCanvas(texture.image.width, texture.image.height);
			ocanvas.getContext('bitmaprenderer')?.transferFromImageBitmap(texture.image);
			const blob = await ocanvas.convertToBlob({ type: texture.userData.mimeType });
			const buffer = await blob.arrayBuffer();
			const b64 = arrayBufferToB64(buffer);
			const uri = `data:${texture.userData.mimeType};base64,${b64}`;
			return {
				data: {
					localUri: uri
				},
				height: texture.image.height,
				width: texture.image.width,
			}
		} else {
			const image = texture.image as VrmThumbnail;
			return image;
		}

	} else {
		console.log('No thumbnail!');
		return null
	}
};
const getVrm1Thumb = async (parser: GLTFParser,) => {
	const thumbIdx = parser.json.extensions?.['VRMC_vrm']?.meta?.thumbnailImage;
	if (thumbIdx) {
		const source = parser.json.images?.[thumbIdx] as { bufferView: number | null; mimeType: string; name: string };
		if (!source) {
			console.log(`VRMMetaLoaderPlugin: Attempt to use images[${thumbIdx}] of glTF as a thumbnail but the image doesn't exist`)
			return null;
		}
		// Load the binary as a blob
		if (source.bufferView != null) {
			// Get array buffer
			// TODO: empty array buffer is returned on mobile
			const bufferView = await parser.loadBufferView(source.bufferView);
			if (bufferView.byteLength < 1) return null;

			const b64 = arrayBufferToB64(bufferView);
			const uri = `data:${source.mimeType};base64,${b64}`;
			return {
				data: {
					localUri: uri
				},
				height: 600,
				width: 600
			}
		} else {
			console.log('No Bufferview');
		}
	} else {
		console.log('No Thumbnail')
		return null;
	}
	return null;
};

/**
 * Mobile: Only VRM0 works
 */
export const getVrmThumbnail = async (parser: GLTFParser, vrmVersion: VRMMeta['metaVersion']): Promise<VrmThumbnail | null> => {
	if (vrmVersion === '0') {
		return getVrm0Thumb(parser);
	} else {
		return getVrm1Thumb(parser);
	}
};