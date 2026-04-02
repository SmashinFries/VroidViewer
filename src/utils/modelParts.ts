import { VRMCore } from '@pixiv/three-vrm';
import * as THREE from 'three';
import { ModelPart } from '../types/types';

const debugWardrobe = (...args: any[]) => {
	if (typeof __DEV__ !== 'undefined' && __DEV__) {
		console.log('[Wardrobe]', ...args);
	}
};

const CLOTHING_KEYWORDS = [
	'cloth',
	'clothes',
	'outfit',
	'shirt',
	'tee',
	't-shirt',
	'tshirt',
	'top',
	'blouse',
	'dress',
	'skirt',
	'pants',
	'trouser',
	'jean',
	'short',
	'hood',
	'hoodie',
	'jacket',
	'coat',
	'sweater',
	'cardigan',
	'vest',
	'uniform',
	'armor',
	'armour',
	'kimono',
	'yukata',
	'shoe',
	'sneaker',
	'boot',
	'sock',
	'glove',
	'belt',
	'scarf',
	'hat',
	'cap',
	'ribbon',
	'tie',
	'necklace',
	'earring',
	'bracelet',
	'ring',
	'accessory',
	'bag',
	'backpack',
	'sleeve',
	'collar',
	'cuff',
	'cape',
	'wear',
	'outer',
	'inner',
	'underwear',
	'lingerie',
	'corset',
	'bra',
	'panty',
	'socks',
	'stocking',
	'stockings',
	'boots',
	'shoes',
	'sneakers',
	'skirtfront',
	'skirtback',
];

const HAIR_KEYWORDS = ['hair', 'braid', 'ponytail', 'bangs', 'fringe'];

const EXCLUDE_KEYWORDS = [
	'body',
	'skin',
	'face',
	'head',
	'eye',
	'iris',
	'sclera',
	'eyebrow',
	'brow',
	'eyelash',
	'lash',
	'teeth',
	'tongue',
	'mouth',
	'gum',
	'nose',
	'cheek',
	'ear',
	'bone',
	'armature',
	'rig',
	'root',
];

const normalizeName = (value: string) => value.trim().toLowerCase();
const matchKey = (value: string) =>
	normalizeName(value)
		.replace(/[^a-z0-9]/g, '')
		.trim();

const toDisplayName = (value: string) => {
	const cleaned = value.replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();
	return cleaned.replace(/\b\w/g, (match) => match.toUpperCase());
};

const isClothingCandidate = (value: string) => {
	if (!value) return false;
	const normalized = normalizeName(value);
	const hasInclude =
		CLOTHING_KEYWORDS.some((keyword) => normalized.includes(keyword)) ||
		HAIR_KEYWORDS.some((keyword) => normalized.includes(keyword));
	const hasExclude = EXCLUDE_KEYWORDS.some((keyword) => normalized.includes(keyword));
	return hasInclude && !hasExclude;
};

const isRenderableMesh = (object: THREE.Object3D) => {
	return (
		(object as any).isMesh === true ||
		(object as any).isSkinnedMesh === true ||
		object.type === 'Mesh' ||
		object.type === 'SkinnedMesh'
	);
};

const getPrimaryMaterialName = (mesh: THREE.Mesh) => {
	if (Array.isArray(mesh.material)) {
		const named = mesh.material
			.map((material) => (material?.name ?? '').trim())
			.find((name) => name.length > 0);
		return named ?? '';
	}
	return (mesh.material as THREE.Material | undefined)?.name?.trim() ?? '';
};

export const extractModelParts = (
	vrm: VRMCore,
	options?: { includeAll?: boolean },
): ModelPart[] => {
	const partsById = new Map<string, ModelPart>();
	let meshCount = 0;
	const includeAll = options?.includeAll ?? false;

	vrm.scene.traverse((object) => {
		if (!isRenderableMesh(object)) return;
		const mesh = object as THREE.Mesh;
		meshCount += 1;

		const rawMeshName = (mesh.name ?? '').trim();
		const rawMaterialName = getPrimaryMaterialName(mesh);
		const keySource = rawMeshName || rawMaterialName;

		if (!keySource) return;
		if (!includeAll && !isClothingCandidate(keySource)) return;

		const partId = matchKey(keySource) || normalizeName(keySource);
		const displayName = toDisplayName(keySource);
		const meshName = rawMeshName ? matchKey(rawMeshName) : '';
		const materialMatch = rawMaterialName ? matchKey(rawMaterialName) : '';

		const existing = partsById.get(partId);
		if (existing) {
			if (meshName && !existing.meshNames.includes(meshName)) {
				existing.meshNames.push(meshName);
			}
			if (materialMatch && !existing.meshNames.includes(materialMatch)) {
				existing.meshNames.push(materialMatch);
			}
			return;
		}

		const meshNames: string[] = [];
		if (meshName) {
			meshNames.push(meshName);
		} else if (materialMatch) {
			meshNames.push(materialMatch);
		} else {
			meshNames.push(partId);
		}
		if (materialMatch && !meshNames.includes(materialMatch)) {
			meshNames.push(materialMatch);
		}

		partsById.set(partId, {
			id: partId,
			name: displayName,
			meshNames,
			hidden: false,
		});
	});

	const result = Array.from(partsById.values()).sort((a, b) => a.name.localeCompare(b.name));
	debugWardrobe('extracted parts', {
		meshes: meshCount,
		parts: result.map((part) => part.name),
		includeAll,
	});
	return result;
};

export const getHiddenMeshNames = (parts: ModelPart[]) => {
	const hiddenNames = parts
		.filter((part) => part.hidden)
		.flatMap((part) => part.meshNames.map((name) => matchKey(name)));

	return Array.from(new Set(hiddenNames));
};

export const applyModelPartsVisibility = (vrm: VRMCore | null, parts: ModelPart[]) => {
	if (!vrm) return;
	const hiddenNames = new Set(getHiddenMeshNames(parts));
	debugWardrobe('apply visibility', {
		hidden: Array.from(hiddenNames),
		partCount: parts.length,
	});

	vrm.scene.traverse((object) => {
		if (!isRenderableMesh(object)) return;
		const mesh = object as THREE.Mesh;
		const meshName = matchKey(mesh.name ?? '');
		const materialNames: string[] = [];
		if (Array.isArray(mesh.material)) {
			for (const material of mesh.material) {
				if (material?.name) {
					materialNames.push(matchKey(material.name));
				}
			}
		} else if (mesh.material && (mesh.material as THREE.Material).name) {
			materialNames.push(matchKey((mesh.material as THREE.Material).name));
		}

		const candidates = [meshName, ...materialNames].filter((name) => name.length > 0);
		if (!candidates.length) return;

		const shouldHide = candidates.some((name) => hiddenNames.has(name));
		if (mesh.visible !== !shouldHide) {
			debugWardrobe('mesh visibility change', {
				mesh: mesh.name,
				materials: materialNames,
				candidates,
				hidden: shouldHide,
			});
		}
		mesh.visible = !shouldHide;
	});
};
