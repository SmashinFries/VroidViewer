import { Button, Text, View } from 'react-native';
import { ANIMS, useModelStore } from '../../store/useModelStore';
import { ModalButton } from '../modal';
import { useModal } from '../../hooks/useModal';

export const AnimationsView = () => {
	const { loadAnimation, animationName } = useModelStore();
	const { onModalToggle, visible } = useModal();

	const onButtonPress = (name: keyof typeof ANIMS) => {
		loadAnimation(name);
		onModalToggle(false);
	};

	return (
		<ModalButton
			vis={visible}
			onToggle={onModalToggle}
			icon="videocam-outline"
			containerStyle={{ minWidth: '35%' }}
		>
			<Text style={{ fontSize: 24, fontWeight: '800' }}>Animations</Text>
			<View style={{ gap: 8, flexDirection: 'row', flexWrap: 'wrap' }}>
				{Object.keys(ANIMS).map((key, idx) => (
					<Button
						key={idx}
						title={key}
						disabled={animationName === key}
						onPress={() => onButtonPress(key as keyof typeof ANIMS)}
					/>
				))}
			</View>
		</ModalButton>
	);
};
