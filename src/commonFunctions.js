import uuid from 'uuid';
import config from './config';

export const getAllExtensions = () => {
	return new Promise((resolve, reject) => {
		chrome.management.getAll(extensionsAndApps => {
			chrome.management.getSelf(selfExtension => {
				const extensions = extensionsAndApps.filter(
					extension => !extension.isApp && extension.id !== selfExtension.id
				);

				return resolve(extensions);
			});
		});
	});
};

export const getExtensionsCategoryMapping = () => {
	return new Promise((resolve, reject) => {
		chrome.storage.sync.get(config.STORAGE_KEY, function(result) {
			console.log('map result: ', result);

			return result[config.STORAGE_KEY]
				? resolve(result[config.STORAGE_KEY])
				: reject(new Error('Extensions Category Mapping Not found'));
		});
	});
};

export const getMergedExtensionsCategories = () => {
	return Promise.all([getAllExtensions(), getExtensionsCategoryMapping()]).then(
		([allExtensions, extensionsCategoryMapping]) => {
			console.log('allExtensions: ', allExtensions);
			console.log('extensionsCategoryMapping: ', extensionsCategoryMapping);

			function mergeExtension(extension) {
				const chromeExtension = allExtensions.find(chromeExt => chromeExt.id === extension.id);

				return {
					...extension,
					enabled: chromeExtension.enabled,
					iconUrl: chromeExtension.icons.length ? chromeExtension.icons[0].url : ''
				};
			}

			function updateCategory(category) {
				return {
					...category,
					extensions: category.extensions.map(mergeExtension)
				};
			}

			return extensionsCategoryMapping.map(updateCategory);
		}
	);
};

export const setExtensionsCategoryMapping = groups => {
	return new Promise((resolve, reject) => {
		chrome.storage.sync.set({ [config.STORAGE_KEY]: groups }, function() {
			return resolve(groups);
		});
	});
};

export const addNewCategoryInStorage = categoryName => {
	return getExtensionsCategoryMapping().then(extensionsCategoryMapping => {
		const existingCategory = extensionsCategoryMapping.find(
			category => category.name === categoryName
		);

		if (existingCategory) throw new Error('Category Name already exist');

		const newCategoryMapping = { extensions: [], name: categoryName, id: uuid() };
		extensionsCategoryMapping.unshift(newCategoryMapping);

		return setExtensionsCategoryMapping(extensionsCategoryMapping);
	});
};

export const moveExtension = (fromCategoryId, toCategoryId, extensionId) => {
	return getExtensionsCategoryMapping().then(extensionsCategoryMapping => {
		const sourceCategory = extensionsCategoryMapping.find(
			category => category.id === fromCategoryId
		);
		const targetCategory = extensionsCategoryMapping.find(category => category.id === toCategoryId);
		const extensionIndexInSourceCategory = sourceCategory.extensions.findIndex(
			extension => extension.id === extensionId
		);

		targetCategory.extensions.push(sourceCategory.extensions[extensionIndexInSourceCategory]);
		sourceCategory.extensions.splice(extensionIndexInSourceCategory, 1);

		return setExtensionsCategoryMapping(extensionsCategoryMapping);
	});
};

export const updateExtensionStatus = (extensionId, enabled) => {
	return new Promise(resolve =>
		chrome.management.setEnabled(extensionId, enabled, () => resolve())
	);
};

export const resetGroups = () => {
	return getAllExtensions().then(extensions => {
		const groups = [
			{
				name: 'Uncategorized',
				id: uuid(),
				extensions: extensions.map(({ name, id }) => ({ name, id }))
			}
		];

		return setExtensionsCategoryMapping(groups);
	});
};

export const updateGroups = existingGroups => {
	return getAllExtensions().then(extensions => {
		const notFoundExtensions = [...extensions];

		const updatedGroups = existingGroups.map(group => {
			// remove not found extensions from all groups
			const updatedGroup = {
				...group,
				extensions: group.extensions.filter(groupExtension => {
					const extensionPosition = notFoundExtensions.findIndex(
						extension => extension.id === groupExtension.id
					);

					return extensionPosition > -1 && !!notFoundExtensions.splice(extensionPosition, 1).length;
				})
			};

			console.log(notFoundExtensions);

			// add new extensions in uncategorised group
			if (group.name === 'Uncategorized' && notFoundExtensions.length) {
				updatedGroup.extensions = [...updatedGroup.extensions, ...notFoundExtensions];
			}

			return updatedGroup;
		});

		return setExtensionsCategoryMapping(updatedGroups);
	});
};
