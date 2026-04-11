import { Platform, Pressable, View, StyleSheet, ViewStyle } from 'react-native';
import { ComponentProps, ReactNode } from 'react';
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
			<View style={styles.shadowWrapper}>
				<View style={styles.iconContainer}>
					<Pressable style={styles.pressable} onPress={() => onToggle(true)}>
						<Ionicons name={icon} size={25} />
					</Pressable>
				</View>
			</View>
			<Modal
				animationIn={'fadeIn'}
				animationOut={'fadeOut'}
				isVisible={vis}
				onBackdropPress={() => onToggle(false)}
			>
				<View style={[styles.modalContainer, containerStyle]}>
					{children}
				</View>
			</Modal>
		</>
	);
};

const styles = StyleSheet.create({
	shadowWrapper: {
		borderRadius: 16,
		...(Platform.OS === 'ios'
			? {
					shadowColor: '#000',
					shadowOffset: { width: 0, height: 2 },
					shadowOpacity: 0.25,
					shadowRadius: 3.84,
				}
			: {
					elevation: 8,
				}),
	},

	iconContainer: {
		backgroundColor: 'rgba(255,255,255,0.8)',
		borderRadius: 16,
		justifyContent: 'center',
		alignItems: 'center',
	},

	pressable: {
		padding: 10,
	},

	modalContainer: {
		justifyContent: 'center',
		alignItems: 'flex-start',
		backgroundColor: 'rgba(255,255,255,0.95)',
		alignSelf: 'center',
		borderRadius: 12,
		padding: 12,
		gap: 4,
	},
});
