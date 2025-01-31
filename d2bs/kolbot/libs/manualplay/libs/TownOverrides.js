/*
*	@filename	TownOverrides.js
*	@author		theBGuy
*	@desc		Town.js fixes to improve functionality for map mode
*/

if (!isIncluded("common/Town.js")) { include("common/Town.js"); }

Town.stash = function (stashGold = true) {
	me.cancel();

	let items = me.getItemsEx()
		.filter(function (item) {
			return item.isInInventory && !(item.isEquippedCharm && (item.quality === sdk.itemquality.Unique || Storage.Inventory.IsLocked(item, Config.Inventory)));
		})
		.sort(function (a, b) {
			if (a.itemType >= 96 && a.itemType <= 102 || a.itemType === 74 || a.quality === 7) {
				return -1;
			}

			if (b.itemType >= 96 && b.itemType <= 102 || b.itemType === 74 || b.quality === 7) {
				return 1;
			}

			return a.quality - b.quality;
		});

	if (items) {
		for (let i = 0; i < items.length; i++) {
			if (this.canStash(items[i])) {
				Misc.itemLogger("Stashed", items[i]);
				Storage.Stash.MoveTo(items[i]);
			}
		}
	}

	// Stash gold
	if (stashGold) {
		if (me.getStat(14) >= Config.StashGold && me.getStat(15) < 25e5 && this.openStash()) {
			gold(me.getStat(14), 3);
			delay(1000); // allow UI to initialize
			me.cancel();
		}
	}

	return true;
};
