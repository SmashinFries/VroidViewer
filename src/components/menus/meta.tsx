import { Text } from 'react-native';
import { useModelStore } from '../../store/useModelStore';
import { VRMMeta } from '@pixiv/three-vrm';
import { ModalButton } from '../modal';
import { useModal } from '../../hooks/useModal';

export const MetaView = () => {
	const { vrm } = useModelStore();
	const { onModalToggle, visible } = useModal();

	return (
		<ModalButton vis={visible} onToggle={onModalToggle} icon="information-circle-outline">
			{vrm?.meta ? (
				Object.keys(vrm?.meta).map((key, idx) =>
					typeof vrm.meta[key as keyof VRMMeta] !== 'boolean' &&
					vrm.meta[key as keyof VRMMeta] !== undefined ? (
						<Text key={idx}>
							{key}: {vrm.meta[key as keyof VRMMeta]}
						</Text>
					) : null,
				)
			) : (
				<Text>Model Loading!</Text>
			)}
		</ModalButton>
	);
};
