import { VRM0Meta, VRM1Meta, VRMMeta } from '@pixiv/three-vrm';
import { Image } from 'react-native';
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

/**
 * Only VRM0 works for now
 */
export const getVrmThumbnail = async (parser: GLTFParser, vrmVersion: VRMMeta['metaVersion']): Promise<VrmThumbnail | null> => {
	const parserJson = parser.json;
	const extensions = parserJson.extensions;
	if (vrmVersion === '0') {
		const vrmExt = extensions?.VRM;
		const schemaMeta = vrmExt.meta;

		if (schemaMeta.texture != null && schemaMeta.texture !== -1) {
			const texture: Texture = await parser.getDependency('texture', schemaMeta.texture);
			const image = texture.image as VrmThumbnail;
			return image;
		} else {
			console.log('No thumbnail!');
			return null
		}
	} else {
		const thumbIdx = extensions?.['VRMC_vrm']?.meta?.thumbnailImage;
		if (thumbIdx) {
			const source = parserJson.images?.[thumbIdx] as { bufferView: number | null; mimeType: string; name: string };
			if (!source) {
				console.log(`VRMMetaLoaderPlugin: Attempt to use images[${thumbIdx}] of glTF as a thumbnail but the image doesn't exist`)
				return null;
			}
			console.log(source);
			// Load the binary as a blob
			if (source.bufferView != null) {
				// Get array buffer
				// TODO: empty array buffer is returned
				const bufferView = await parser.loadBufferView(source.bufferView);
				if (bufferView.byteLength < 1) return null;

				// Untested code
				const blob = new Blob([bufferView], { type: source.mimeType });
				let b64: string = '';
				blob.arrayBuffer().then(arrayBuffer => {
					const byteArray = new Uint8Array(arrayBuffer);
					const base64 = btoa(String.fromCharCode(...byteArray));
					// console.debug(base64);
					b64 = base64;
				});
				console.log('base64:', b64);
				console.log('object:', URL.createObjectURL(blob));
				if (b64.length < 1) return null;
				const uri = `data:${source.mimeType};base64,${b64}`;
				const { height, width } = await Image.getSize(uri)
				return {
					data: {
						localUri: `data:${source.mimeType};base64,${b64}`
					},
					height,
					width
				}
			} else {
				console.log('No Bufferview');
			}
		} else {
			console.log('No Thumbnail')
			return null;
		}
		return null;
	}
};