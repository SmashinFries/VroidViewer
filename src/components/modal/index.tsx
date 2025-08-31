import { Pressable, View, ViewStyle } from 'react-native';
import { ComponentProps, ReactNode, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import Modal from 'react-native-modal';

export const ModalButton = ({
	vis,
	onToggle,
	icon,
	containerStyle,
	children,
}: {
	vis: boolean;
	onToggle: (show: boolean) => void;
	icon: ComponentProps<typeof Ionicons>['name'];
	containerStyle?: ViewStyle;
	children?: ReactNode;
}) => {
	return (
		<>
			<View
				style={{
					backgroundColor: 'rgba(255,255,255,0.8)',
					borderRadius: 38 / 2,
				}}
			>
				<Pressable
					style={{ padding: 6 }}
					onPress={() => {
						onToggle(true);
						console.log('Open!');
					}}
				>
					<Ionicons name={icon} size={38} />
				</Pressable>
			</View>
			<Modal isVisible={vis} onBackdropPress={() => onToggle(false)}>
				<View
					style={[
						{
							justifyContent: 'center',
							alignItems: 'flex-start',
							backgroundColor: 'rgba(255,255,255,0.8)',
							alignSelf: 'center',
							borderRadius: 12,
							padding: 12,
							gap: 4,
						},
						containerStyle,
					]}
				>
					{children}
				</View>
			</Modal>
		</>
	);
};
