import type { ModelAction, ModelSlice } from '../types';

export const facialExpressionSlice: ModelSlice<
	Pick<ModelAction, 'applyFacialExpression' | 'setFacialExpression'>
> = (set, get) => ({
	applyFacialExpression: () => {
		const { vrm, facialExpression, expressionMap } = get();

		if (!vrm?.expressionManager) {
			return;
		}

		try {
			const expressionManager = vrm.expressionManager;

			// Get expression names properly
			const expressionNames = Object.keys(expressionManager.expressions);

			// Reset all expressions to 0
			expressionNames.forEach((expressionName) => {
				try {
					expressionManager.setValue(expressionName, 0);
				} catch (error) {
					console.warn(`Failed to reset expression '${expressionName}':`, error);
				}
			});

			// Apply the current facial expression
			const expressionValues = expressionMap[facialExpression];

			if (expressionValues) {
				for (const [expressionName, value] of Object.entries(expressionValues)) {
					const clampedValue = Math.max(0, Math.min(1, value));

					try {
						expressionManager.setValue(expressionName, clampedValue);
					} catch (error) {
						console.warn(`Failed to set expression '${expressionName}':`, error);
					}
				}
			}

			expressionManager.update();

			// Mark as updated
			set({ expressionNeedsUpdate: false });
		} catch (error) {
			console.error('Error applying facial expression:', error);
		}
	},

	setFacialExpression: (expression: string) => {
		set({ facialExpression: expression });

		// Apply the expression immediately after setting it
		setTimeout(() => {
			get().applyFacialExpression();
		}, 0);
	},
});
