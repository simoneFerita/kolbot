/**
*	@filename	Attack.js
*	@author		kolton
*	@desc		handle player attacks
*/

// eslint-disable-next-line no-redeclare
const Attack = {
	classes: ["Amazon", "Sorceress", "Necromancer", "Paladin", "Barbarian", "Druid", "Assassin"],
	infinity: false,

	// Initialize attacks
	init: function () {
		if (Config.Wereform) {
			include("common/Attacks/wereform.js");
		} else if (Config.CustomClassAttack && FileTools.exists('libs/common/Attacks/' + Config.CustomClassAttack + '.js')) {
			print('Loading custom attack file');
			include('common/Attacks/' + Config.CustomClassAttack + '.js');
		} else {
			include("common/Attacks/" + this.classes[me.classid] + ".js");
		}

		if (Config.AttackSkill[1] < 0 || Config.AttackSkill[3] < 0) {
			showConsole();
			print("ÿc1Bad attack config. Don't expect your bot to attack.");
		}

		if (me.expansion) {
			this.checkInfinity();
			this.getCharges();
			this.getPrimarySlot();
		}
	},

	weaponSwitch: function (slot) {
		if (me.classic || me.weaponswitch === slot) return true;
		slot === undefined && (slot = me.weaponswitch ^ 1);

		for (let i = 0; i < 5; i += 1) {
			delay(100 + me.ping);
			weaponSwitch();

			let tick = getTickCount();

			while (getTickCount() - tick < 2000 + me.ping) {
				if (me.weaponswitch === slot) {
					return true;
				}

				delay(10);
			}
		}

		return false;
	},

	 // check if slot has items
	checkSlot: function (slot = me.weaponswitch) {
		let item = me.getItem(-1, 1);

		if (item) {
			do {
				if (me.weaponswitch !== slot) {
					if (item.bodylocation === 11 || item.bodylocation === 12) {
						return true;
					}
				} else {
					if (item.bodylocation === 4 || item.bodylocation === 5) {
						return true;
					}
				}
			} while (item.getNext());
		}

		return false;
	},

	getPrimarySlot: function () {
		if (Config.PrimarySlot === -1) { // determine primary slot if not set
			if ((Precast.haveCTA > -1) || Precast.checkCTA()) { // have cta
				if (this.checkSlot(Precast.haveCTA ^ 1)) { // have item on non-cta slot
					Config.PrimarySlot = Precast.haveCTA ^ 1; // set non-cta slot as primary
				} else { // other slot is empty
					Config.PrimarySlot = Precast.haveCTA; // set cta as primary slot
				}
			} else if (!this.checkSlot(0) && this.checkSlot(1)) { // only slot II has items
				Config.PrimarySlot = 1;
			} else { // both slots have items, both are empty, or only slot I has items
				Config.PrimarySlot = 0;
			}
		}

		return Config.PrimarySlot;
	},

	getCustomAttack: function (unit) {
		// Check if unit got invalidated
		if (!unit || !unit.name || !copyUnit(unit).x) {
			return false;
		}

		for (let i in Config.CustomAttack) {
			if (Config.CustomAttack.hasOwnProperty(i) && unit.name.toLowerCase() === i.toLowerCase()) {
				return Config.CustomAttack[i];
			}
		}

		return false;
	},

	// Get items with charges
	getCharges: function () {
		if (!Skill.charges) {
			Skill.charges = [];
		}

		let i, stats,
			item = me.getItem(-1, 1);

		if (item) {
			do {
				stats = item.getStat(-2);

				if (stats.hasOwnProperty(204)) {
					if (stats[204] instanceof Array) {
						for (i = 0; i < stats[204].length; i += 1) {
							if (stats[204][i] !== undefined) {
								Skill.charges.push({
									unit: copyUnit(item),
									gid: item.gid,
									skill: stats[204][i].skill,
									level: stats[204][i].level,
									charges: stats[204][i].charges,
									maxcharges: stats[204][i].maxcharges
								});
							}
						}
					} else {
						Skill.charges.push({
							unit: copyUnit(item),
							gid: item.gid,
							skill: stats[204].skill,
							level: stats[204].level,
							charges: stats[204].charges,
							maxcharges: stats[204].maxcharges
						});
					}
				}
			} while (item.getNext());
		}

		return true;
	},

	// Check if player or his merc are using Infinity, and adjust resistance checks based on that
	checkInfinity: function () {
		let i, merc, item;

		for (i = 0; i < 3; i += 1) {
			merc = me.getMerc();

			if (merc) {
				break;
			}

			delay(50);
		}

		// Check merc infinity
		if (merc) {
			item = merc.getItem();

			if (item) {
				do {
					if (item.getPrefix(20566)) {
						this.infinity = true;

						return true;
					}
				} while (item.getNext());
			}
		}

		// Check player infinity
		item = me.getItem(-1, 1);

		if (item) {
			do {
				if (item.getPrefix(20566)) {
					this.infinity = true;

					return true;
				}
			} while (item.getNext());
		}

		return false;
	},

	// Kill a monster based on its classId, can pass a unit as well
	kill: function (classId) {
		if (!classId || Config.AttackSkill[1] < 0) return false;
		let target = (typeof classId === "object" ? classid : Misc.poll(function () { return getUnit(1, classId); }, 2000, 100));

		if (!target) {
			console.warn("Attack.kill: Target not found");
			return Attack.clear(10);
		}

		let retry = 0,
			errorInfo = "",
			attackCount = 0,
			gid = target.gid;

		let findTarget = function (gid, loc) {
			let path = getPath(me.area, me.x, me.y, loc.x, loc.y, 1, 5);
			if (!path) return false;

			if (path.some(function (node) {
				Pather.walkTo(node.x, node.y);
				return getUnit(1, -1, -1, gid);
			})) {
				return getUnit(1, -1, -1, gid);
			} else {
				return false;
			}
		};

		let lastLoc = {x: me.x, y: me.y};
		Config.MFLeader && Pather.makePortal() && say("kill " + classId);

		while (attackCount < Config.MaxAttackCount && target.attackable && this.skipCheck(target)) {
			Misc.townCheck();
			
			// Check if unit got invalidated, happens if necro raises a skeleton from the boss's corpse.
			if (!target || !copyUnit(target).x) { 
				target = getUnit(1, -1, -1, gid);
				!target && (target = findTarget(gid, lastLoc));

				if (!target) {
					break;
				}
			}

			Config.Dodge && me.hpPercent <= Config.DodgeHP && this.deploy(target, Config.DodgeRange, 5, 9);
			Config.MFSwitchPercent && target.hpPercent < Config.MFSwitchPercent && this.weaponSwitch(this.getPrimarySlot() ^ 1);

			if (attackCount > 0 && attackCount % 15 === 0 && Skill.getRange(Config.AttackSkill[1]) < 4) {
				Packet.flash(me.gid);
			}

			let result = ClassAttack.doAttack(target, attackCount % 15 === 0);

			if (result === 0) {
				if (retry++ > 3) {
					errorInfo = " (doAttack failed)";

					break;
				}

				Packet.flash(me.gid);
			} else if (result === 2) {
				errorInfo = " (No valid attack skills)";

				break;
			} else if (result === 3) {
				continue;
			} else {
				retry = 0;
			}

			lastLoc = {x: me.x, y: me.y};
			attackCount++;
		}

		attackCount === Config.MaxAttackCount && (errorInfo = " (attackCount exceeded: " + attackCount + ")");
		Config.MFSwitchPercent && this.weaponSwitch(this.getPrimarySlot());
		ClassAttack.afterAttack();
		Pickit.pickItems();

		if (target && target.attackable) {
			console.warn("Failed to kill " + target.name + errorInfo);
			return false;
		}

		return (!target || !copyUnit(target).x || target.dead || !target.attackable);
	},

	hurt: function (classId, percent) {
		if (!classId || !percent) return false;
		let target = (typeof classId === "object" ? classid : Misc.poll(function () { return getUnit(1, classId); }, 2000, 100));

		if (!target) {
			console.warn("Attack.hurt: Target not found");
			return false
		}

		let retry = 0, attackCount = 0;

		while (attackCount < Config.MaxAttackCount && target.attackable && Attack.skipCheck(target)) {
			let result = ClassAttack.doAttack(target, attackCount % 15 === 0);

			if (result === 0) {
				if (retry++ > 3) {
					break;
				}

				Packet.flash(me.gid);
			} else if (result === 2) {
				break;
			} else if (result === 3) {
				continue;
			} else {
				retry = 0;
			}

			if (!copyUnit(target).x) {
				return true;
			}

			attackCount += 1;

			if (target.hpPercent <= percent) {
				break;
			}
		}

		return true;
	},

	getScarinessLevel: function (unit) {
		let scariness = 0, ids = [58, 59, 60, 61, 62, 101, 102, 103, 104, 105, 278, 279, 280, 281, 282, 298, 299, 300, 645, 646, 647, 662, 663, 664, 667, 668, 669, 670, 675, 676];

		// Only handling monsters for now
		if (unit.type !== 1) return undefined;

		// Minion
		(unit.spectype & 0x08) && (scariness += 1);

		// Champion
		(unit.spectype & 0x02) && (scariness += 2);

		// Boss
		(unit.spectype & 0x04) && (scariness += 4);

		// Summoner or the like
		ids.includes(unit.classid) && (scariness += 8);

		return scariness;
	},

	// Clear monsters in a section based on range and spectype or clear monsters around a boss monster
	// probably going to change to passing an object
	clear: function (range, spectype, bossId, sortfunc, pickit) {
		while (!me.gameReady) {
			delay(40);
		}

		if (Config.AttackSkill[1] < 0 || Config.AttackSkill[3] < 0) return false;

		range === undefined && (range = 25);
		spectype === undefined && (spectype = 0);
		bossId === undefined && (bossId = false);
		sortfunc === undefined && (sortfunc = false);
		pickit === undefined && (pickit = true);
		!sortfunc && (sortfunc = this.sortMonsters);

		if (typeof (range) !== "number") { throw new Error("Attack.clear: range must be a number."); }

		let i, boss, orgx, orgy, result, start, skillCheck,
			retry = 0,
			gidAttack = [],
			attackCount = 0;

		if (bossId) {
			boss = Misc.poll(function () { return bossId > 999 ? getUnit(1, -1, -1, bossId) : getUnit(1, bossId); }, 2000, 100);

			if (!boss) {
				console.warn("Attack.clear: " + bossId + " not found");
				return Attack.clear(10);
			}

			({orgx, orgy} = {orgx: boss.x, orgy: boss.y});
			Config.MFLeader && !!bossId && Pather.makePortal() && say("clear " + bossId);
		} else {
			({orgx, orgy} = {orgx: me.x, orgy: me.y});
		}

		let monsterList = [];
		let target = getUnit(1);

		if (target) {
			do {
				if ((!spectype || (target.spectype & spectype)) && target.attackable && this.skipCheck(target)) {
					// Speed optimization - don't go through monster list until there's at least one within clear range
					if (!start && getDistance(target, orgx, orgy) <= range &&
							(Pather.canTeleport() || !Scripts.Follower || !checkCollision(me, target, 0x1))) {
						start = true;
					}

					monsterList.push(copyUnit(target));
				}
			} while (target.getNext());
		}

		while (start && monsterList.length > 0 && attackCount < Config.MaxAttackCount) {
			if (me.dead) return false;
			
			boss && (({orgx, orgy} = {orgx: boss.x, orgy: boss.y}));
			monsterList.sort(sortfunc);
			target = copyUnit(monsterList[0]);

			if (target.x !== undefined && (getDistance(target, orgx, orgy) <= range || (this.getScarinessLevel(target) > 7 && getDistance(me, target) <= range)) && this.checkMonster(target)) {
				Config.Dodge && me.hpPercent <= Config.DodgeHP && this.deploy(target, Config.DodgeRange, 5, 9);
				Misc.townCheck(true);
				//me.overhead("attacking " + target.name + " spectype " + target.spectype + " id " + target.classid);

				result = ClassAttack.doAttack(target, attackCount % 15 === 0);

				if (result) {
					retry = 0;

					if (result === 2) {
						monsterList.shift();

						continue;
					}

					if (result === 3) {
						continue;
					}

					for (i = 0; i < gidAttack.length; i += 1) {
						if (gidAttack[i].gid === target.gid) {
							break;
						}
					}

					if (i === gidAttack.length) {
						gidAttack.push({gid: target.gid, attacks: 0, name: target.name});
					}

					gidAttack[i].attacks += 1;
					attackCount += 1;
					let secAttack = me.barbarian ? ((target.spectype & 0x7) ? 2 : 4) : 5;

					if (Config.AttackSkill[secAttack] > -1 && (!Attack.checkResist(target, Config.AttackSkill[(target.spectype & 0x7) ? 1 : 3]) ||
							(me.classid === 3 && Config.AttackSkill[(target.spectype & 0x7) ? 1 : 3] === 112 && !ClassAttack.getHammerPosition(target)))) {
						skillCheck = Config.AttackSkill[secAttack];
					} else {
						skillCheck = Config.AttackSkill[(target.spectype & 0x7) ? 1 : 3];
					}

					// Desync/bad position handler
					switch (skillCheck) {
					case 112:
						// Tele in random direction with Blessed Hammer
						if (gidAttack[i].attacks > 0 && gidAttack[i].attacks % ((target.spectype & 0x7) ? 4 : 2) === 0) {
							let coord = CollMap.getRandCoordinate(me.x, -1, 1, me.y, -1, 1, 5);
							Pather.moveTo(coord.x, coord.y);
						}

						break;
					default:
						// Flash with melee skills
						if (gidAttack[i].attacks > 0 && gidAttack[i].attacks % ((target.spectype & 0x7) ? 15 : 5) === 0 && Skill.getRange(skillCheck) < 4) {
							Packet.flash(me.gid);
						}

						break;
					}

					// Skip non-unique monsters after 15 attacks, except in Throne of Destruction
					if (me.area !== 131 && !(target.spectype & 0x7) && gidAttack[i].attacks > 15) {
						print("ÿc1Skipping " + target.name + " " + target.gid + " " + gidAttack[i].attacks);
						monsterList.shift();
					}

					if (target.mode === 0 || target.mode === 12 || Config.FastPick === 2) {
						Pickit.fastPick();
					}
				} else {
					if (retry++ > 3) {
						monsterList.shift();
						retry = 0;
					}

					Packet.flash(me.gid);
				}
			} else {
				monsterList.shift();
			}
		}

		ClassAttack.afterAttack(pickit);
		this.openChests(range, orgx, orgy);
		attackCount > 0 && pickit && Pickit.pickItems();

		return true;
	},

	clearClassids: function (...ids) {
		let monster = getUnit(1);

		if (monster) {
			let list = [];

			do {
				if (ids.includes(monster.classid) && monster.attackable) {
					list.push(copyUnit(monster));
				}
			} while (monster.getNext());

			Attack.clearList(list);
		}

		return true;
	},

	// Filter monsters based on classId, spectype and range
	getMob: function (classid, spectype, range, center) {
		let monsterList = [],
			monster = getUnit(1);

		range === undefined && (range = 25);
		!center && (center = me);

		switch (typeof classid) {
		case "number":
		case "string":
			monster = getUnit(1, classid);

			if (monster) {
				do {
					if (getDistance(center.x, center.y, monster.x, monster.y) <= range && (!spectype || (monster.spectype & spectype)) && this.checkMonster(monster)) {
						monsterList.push(copyUnit(monster));
					}
				} while (monster.getNext());
			}

			break;
		case "object":
			monster = getUnit(1);

			if (monster) {
				do {
					if (classid.indexOf(monster.classid) > -1 && getDistance(center.x, center.y, monster.x, monster.y) <= range && (!spectype || (monster.spectype & spectype)) && this.checkMonster(monster)) {
						monsterList.push(copyUnit(monster));
					}
				} while (monster.getNext());
			}

			break;
		}

		if (!monsterList.length) {
			return false;
		}

		return monsterList;
	},

	// Clear an already formed array of monstas
	clearList: function (mainArg, sortFunc, refresh) {
		let i, target, monsterList,
			retry = 0,
			gidAttack = [],
			attackCount = 0;

		switch (typeof mainArg) {
		case "function":
			monsterList = mainArg.call();

			break;
		case "object":
			monsterList = mainArg.slice(0);

			break;
		case "boolean": // false from Attack.getMob()
			return false;
		default:
			throw new Error("clearList: Invalid argument");
		}

		!sortFunc && (sortFunc = this.sortMonsters);

		while (monsterList.length > 0 && attackCount < Config.MaxAttackCount) {
			if (refresh && attackCount > 0 && attackCount % refresh === 0) {
				monsterList = mainArg.call();
			}

			if (me.dead) return false;

			monsterList.sort(sortFunc);
			target = copyUnit(monsterList[0]);

			if (target.x !== undefined && this.checkMonster(target)) {
				Config.Dodge && me.hpPercent <= Config.DodgeHP && this.deploy(target, Config.DodgeRange, 5, 9);
				Misc.townCheck(true);
				//me.overhead("attacking " + target.name + " spectype " + target.spectype + " id " + target.classid);

				let result = ClassAttack.doAttack(target, attackCount % 15 === 0);

				if (result) {
					retry = 0;

					if (result === 2) {
						monsterList.shift();

						continue;
					}

					if (result === 3) {
						continue;
					}

					for (i = 0; i < gidAttack.length; i += 1) {
						if (gidAttack[i].gid === target.gid) {
							break;
						}
					}

					if (i === gidAttack.length) {
						gidAttack.push({gid: target.gid, attacks: 0});
					}

					gidAttack[i].attacks += 1;

					// Desync/bad position handler
					switch (Config.AttackSkill[(target.spectype & 0x7) ? 1 : 3]) {
					case 112:
						// Tele in random direction with Blessed Hammer
						if (gidAttack[i].attacks > 0 && gidAttack[i].attacks % ((target.spectype & 0x7) ? 5 : 15) === 0) {
							let coord = CollMap.getRandCoordinate(me.x, -1, 1, me.y, -1, 1, 4);
							Pather.moveTo(coord.x, coord.y);
						}

						break;
					default:
						// Flash with melee skills
						if (gidAttack[i].attacks > 0 && gidAttack[i].attacks % ((target.spectype & 0x7) ? 5 : 15) === 0 && Skill.getRange(Config.AttackSkill[(target.spectype & 0x7) ? 1 : 3]) < 4) {
							Packet.flash(me.gid);
						}

						break;
					}

					// Skip non-unique monsters after 15 attacks, except in Throne of Destruction
					if (me.area !== 131 && !(target.spectype & 0x7) && gidAttack[i].attacks > 15) {
						print("ÿc1Skipping " + target.name + " " + target.gid + " " + gidAttack[i].attacks);
						monsterList.shift();
					}

					attackCount += 1;

					if (target.mode === 0 || target.mode === 12 || Config.FastPick === 2) {
						Pickit.fastPick();
					}
				} else {
					if (retry++ > 3) {
						monsterList.shift();
						retry = 0;
					}

					Packet.flash(me.gid);
				}
			} else {
				monsterList.shift();
			}
		}

		ClassAttack.afterAttack(true);
		this.openChests(30);
		attackCount > 0 && Pickit.pickItems();

		return true;
	},

	securePosition: function (x, y, range, timer, skipBlocked, special) {
		let tick;

		x === undefined && (x = me.x);
		y === undefined && (y = me.y);
		timer === undefined && (timer = 3000);
		skipBlocked === true && (skipBlocked = 0x4);

		while (true) {
			getDistance(me, x, y) > 5 && Pather.moveTo(x, y);

			let monster = getUnit(1);
			let monList = [];

			if (monster) {
				do {
					if (getDistance(monster, x, y) <= range && monster.attackable && this.canAttack(monster) &&
							(!skipBlocked || !checkCollision(me, monster, skipBlocked)) &&
							(Pather.canTeleport() || !checkCollision(me, monster, 0x1))) {
						monList.push(copyUnit(monster));
					}
				} while (monster.getNext());
			}

			if (!monList.length) {
				!tick && (tick = getTickCount());

				// only return if it's been safe long enough
				if (getTickCount() - tick >= timer) {
					return;
				}
			} else {
				this.clearList(monList);

				// reset the timer when there's monsters in range
				tick && (tick = false);
			}

			if (special) {
				if (me.paladin && me.getSkill(sdk.skills.Redemption, 1)) {
					Skill.setSkill(sdk.skills.Redemption, 0);
					delay(1000);
				}
			}

			delay(100);
		}
	},

	// Draw lines around a room on minimap
	markRoom: function (room, color) {
		let arr = [];

		arr.push(new Line(room.x * 5, room.y * 5, room.x * 5, room.y * 5 + room.ysize, color, true));
		arr.push(new Line(room.x * 5, room.y * 5, room.x * 5 + room.xsize, room.y * 5, color, true));
		arr.push(new Line(room.x * 5 + room.xsize, room.y * 5, room.x * 5 + room.xsize, room.y * 5 + room.ysize, color, true));
		arr.push(new Line(room.x * 5, room.y * 5 + room.ysize, room.x * 5 + room.xsize, room.y * 5 + room.ysize, color, true));
	},

	countUniques: function () {
		!this.uniques && (this.uniques = 0);
		!this.ignoredGids && (this.ignoredGids = []);

		let monster = getUnit(1);

		if (monster) {
			do {
				if ((monster.spectype & 0x5) && this.ignoredGids.indexOf(monster.gid) === -1) {
					this.uniques += 1;
					this.ignoredGids.push(monster.gid);
				}
			} while (monster.getNext());
		}
	},

	storeStatistics: function (area) {
		if (!FileTools.exists("statistics.json")) {
			Misc.fileAction("statistics.json", 1, "{}");
		}

		let obj = JSON.parse(Misc.fileAction("statistics.json", 0));

		if (obj) {
			if (obj[area] === undefined) {
				obj[area] = {
					runs: 0,
					averageUniques: 0
				};
			}

			obj[area].averageUniques = ((obj[area].averageUniques * obj[area].runs + this.uniques) / (obj[area].runs + 1)).toFixed(4);
			obj[area].runs += 1;

			Misc.fileAction("statistics.json", 1, JSON.stringify(obj));
		}

		this.uniques = 0;
		this.ignoredGids = [];
	},

	// Clear an entire area based on monster spectype
	clearLevel: function (spectype) {
		function RoomSort(a, b) {
			return getDistance(myRoom[0], myRoom[1], a[0], a[1]) - getDistance(myRoom[0], myRoom[1], b[0], b[1]);
		}

		spectype === undefined && (spectype = 0);

		let room = getRoom();
		if (!room) return false;

		let myRoom, previousArea;
		let rooms = [];
		let currentArea = getArea().id;

		do {
			rooms.push([room.x * 5 + room.xsize / 2, room.y * 5 + room.ysize / 2]);
		} while (room.getNext());
		
		if (Config.MFLeader && rooms.length > 0) {
			Pather.makePortal();
			 // tombs exception
			if (me.area > 65 && me.area < 73) {
				say("clearlevel " + me.area);
			} else {
				say("clearlevel " + getArea().name);
			}
		}

		while (rooms.length > 0) {
			// get the first room + initialize myRoom var
			!myRoom && (room = getRoom(me.x, me.y));

			if (Loader.scriptName() === "MFHelper" && Config.MFHelper.BreakClearLevel && Config.Leader !== "") {
				let leader = Misc.findPlayer(Config.Leader);

				if (leader && leader.area !== me.area && !leader.inTown) {
					me.overhead("break the clearing in " + getArea().name);

					return true;
				}
			}

			if (room) {
				// use previous room to calculate distance
				if (room instanceof Array) {
					myRoom = [room[0], room[1]];
				} else {
					// create a new room to calculate distance (first room, done only once)
					myRoom = [room.x * 5 + room.xsize / 2, room.y * 5 + room.ysize / 2];
				}
			}

			rooms.sort(RoomSort);
			room = rooms.shift();

			let result = Pather.getNearestWalkable(room[0], room[1], 18, 3);

			if (result) {
				Pather.moveTo(result[0], result[1], 3, spectype);
				previousArea = result;
				//this.countUniques();

				if (!this.clear(40, spectype)) {
					break;
				}
			} else if (currentArea !== getArea().id) {
				// Make sure bot does not get stuck in different area.
				Pather.moveTo(previousArea[0], previousArea[1], 3, spectype);
			}
		}

		//this.storeStatistics(Pather.getAreaName(me.area));

		return true;
	},

	// Sort monsters based on distance, spectype and classId (summoners are attacked first)
	sortMonsters: function (unitA, unitB) {
		// No special sorting for were-form
		if (Config.Wereform) {
			return getDistance(me, unitA) - getDistance(me, unitB);
		}

		// Barb optimization
		if (me.barbarian) {
			if (!Attack.checkResist(unitA, Attack.getSkillElement(Config.AttackSkill[(unitA.spectype & 0x7) ? 1 : 3]))) {
				return 1;
			}

			if (!Attack.checkResist(unitB, Attack.getSkillElement(Config.AttackSkill[(unitB.spectype & 0x7) ? 1 : 3]))) {
				return -1;
			}
		}

		let ids = [58, 59, 60, 61, 62, 101, 102, 103, 104, 105, 278, 279, 280, 281, 282, 298, 299, 300, 645, 646, 647, 662, 663, 664, 667, 668, 669, 670, 675, 676];

		if (me.area !== 61 && ids.indexOf(unitA.classid) > -1 && ids.indexOf(unitB.classid) > -1) {
			// Kill "scary" uniques first (like Bishibosh)
			if ((unitA.spectype & 0x04) && (unitB.spectype & 0x04)) {
				return getDistance(me, unitA) - getDistance(me, unitB);
			}

			if (unitA.spectype & 0x04) {
				return -1;
			}

			if (unitB.spectype & 0x04) {
				return 1;
			}

			return getDistance(me, unitA) - getDistance(me, unitB);
		}

		if (ids.indexOf(unitA.classid) > -1) {
			return -1;
		}

		if (ids.indexOf(unitB.classid) > -1) {
			return 1;
		}

		if (Config.BossPriority) {
			if ((unitA.spectype & 0x5) && (unitB.spectype & 0x5)) {
				return getDistance(me, unitA) - getDistance(me, unitB);
			}

			if (unitA.spectype & 0x5) {
				return -1;
			}

			if (unitB.spectype & 0x5) {
				return 1;
			}
		}

		return getDistance(me, unitA) - getDistance(me, unitB);
	},

	// Check if a set of coords is valid/accessable
	validSpot: function (x, y) {
		let result;

		if (!me.area || !x || !y) { // Just in case
			return false;
		}

		try { // Treat thrown errors as invalid spot
			result = getCollision(me.area, x, y);
		} catch (e) {
			return false;
		}

		// Avoid non-walkable spots, objects
		if (result === undefined || (result & 0x1) || (result & 0x400)) {
			return false;
		}

		return true;
	},

	// Open chests when clearing
	openChests: function (range, x, y) {
		if (!Config.OpenChests) {
			return false;
		}

		if (x === undefined || y === undefined) {
			x = me.x;
			y = me.y;
		}

		let unit,
			list = [],
			ids = ["chest", "chest3", "weaponrack", "armorstand"];

		unit = getUnit(2);

		if (unit) {
			do {
				if (unit.name && getDistance(unit, x, y) <= range && ids.indexOf(unit.name.toLowerCase()) > -1) {
					list.push(copyUnit(unit));
				}
			} while (unit.getNext());
		}

		while (list.length) {
			list.sort(Sort.units);

			if (Misc.openChest(list.shift())) {
				Pickit.pickItems();
			}
		}

		return true;
	},

	buildMonsterList: function () {
		let monster,
			monList = [];

		monster = getUnit(1);

		if (monster) {
			do {
				if (this.checkMonster(monster)) {
					monList.push(copyUnit(monster));
				}
			} while (monster.getNext());
		}

		return monList;
	},

	findSafeSpot: function (unit, distance, spread, range) {
		if (arguments.length < 4) {
			throw new Error("deploy: Not enough arguments supplied");
		}

		let index,
			monList = [],
			count = 999;

		monList = this.buildMonsterList();
		monList.sort(Sort.units);
		if (this.getMonsterCount(me.x, me.y, 15, monList) === 0) return true;

		CollMap.getNearbyRooms(unit.x, unit.y);
		let grid = this.buildGrid(unit.x - distance, unit.x + distance, unit.y - distance, unit.y + distance, spread);

		if (!grid.length) return false;
		grid.sort((a, b) => getDistance(b.x, b.y, unit.x, unit.y) - getDistance(a.x, a.y, unit.x, unit.y));

		for (let i = 0; i < grid.length; i += 1) {
			if (!(CollMap.getColl(grid[i].x, grid[i].y, true) & 0x1) && !CollMap.checkColl(unit, {x: grid[i].x, y: grid[i].y}, 0x4)) {
				let currCount = this.getMonsterCount(grid[i].x, grid[i].y, range, monList);

				if (currCount < count) {
					index = i;
					count = currCount;
				}

				if (currCount === 0) {
					break;
				}
			}
		}

		if (typeof index === "number") {
			return {
				x: grid[index].x,
				y: grid[index].y,
			};
		}

		return false;
	},

	deploy: function (unit, distance, spread, range) {
		if (arguments.length < 4) {
			throw new Error("deploy: Not enough arguments supplied");
		}

		let safeLoc = this.findSafeSpot(unit, distance, spread, range);

		return (typeof safeLoc === "object" ? Pather.moveToUnit(safeLoc, 0) : false);
	},

	getMonsterCount: function (x, y, range, list) {
		let count = 0,
			ignored = [243];

		for (let i = 0; i < list.length; i += 1) {
			if (ignored.indexOf(list[i].classid) === -1 && list[i].attackable && getDistance(x, y, list[i].x, list[i].y) <= range) {
				count += 1;
			}
		}

		let fire = getUnit(2, "fire");

		if (fire) {
			do {
				if (getDistance(x, y, fire.x, fire.y) <= 4) {
					count += 100;
				}
			} while (fire.getNext());
		}

		return count;
	},

	buildGrid: function (xmin, xmax, ymin, ymax, spread) {
		if (xmin >= xmax || ymin >= ymax || spread < 1) {
			throw new Error("buildGrid: Bad parameters");
		}

		let grid = [];

		for (let i = xmin; i <= xmax; i += spread) {
			for (let j = ymin; j <= ymax; j += spread) {
				let coll = CollMap.getColl(i, j, true);

				if (typeof coll === "number") {
					grid.push({x: i, y: j, coll: coll});
				}
			}
		}

		return grid;
	},

	// Check if a monster is attackable
	checkMonster: function (unit) {
		if (!unit || !copyUnit(unit).x) {
			return false;
		}

		if (unit.area !== me.area) {
			return false;
		}

		if (unit.type === 0 && unit.mode !== 17) { // Player
			return true;
		}

		if (unit.hp === 0 || unit.mode === 0 || unit.mode === 12) { // Dead monster
			return false;
		}

		if (unit.getStat(172) === 2) {	// Friendly monster/NPC
			return false;
		}

		if (unit.charlvl < 1) { // catapults were returning a level of 0 and hanging up clear scripts
			return false;
		}

		if (getBaseStat("monstats", unit.classid, "neverCount")) { // neverCount base stat - hydras, traps etc.
			return false;
		}

		switch (unit.classid) {
		case 179: // An evil force - cow (lol)
			return false;
		case 543: // Baal in Throne
			if (me.area === 131) {
				return false;
			}

			break;
		case 110: // Vultures
		case 111:
		case 112:
		case 113:
		case 114:
		case 608:
			if (unit.mode === 8) { // Flying
				return false;
			}

			break;
		case 68: // Sand Maggots
		case 69:
		case 70:
		case 71:
		case 72:
		case 679:
		case 258: // Water Watchers
		case 259:
		case 260:
		case 261:
		case 262:
		case 263:
			if (unit.mode === 14) { // Submerged/Burrowed
				return false;
			}

			break;
		}

		return true;
	},

	skipCheck: function (unit) {
		if (me.area === 131) {
			return true;
		}

		if ((unit.spectype & 0x7) && Config.SkipException && Config.SkipException.indexOf(unit.name) > -1) {
			print("ÿc1Skip Exception: " + unit.name);
			return true;
		}

		let i, j, rval,
			tempArray = [];

		// EnchantLoop: // Skip enchanted monsters
		for (i = 0; i < Config.SkipEnchant.length; i += 1) {
			tempArray = Config.SkipEnchant[i].toLowerCase().split(" and ");

			for (j = 0; j < tempArray.length; j += 1) {
				switch (tempArray[j]) {
				case "extra strong":
					tempArray[j] = 5;

					break;
				case "extra fast":
					tempArray[j] = 6;

					break;
				case "cursed":
					tempArray[j] = 7;

					break;
				case "magic resistant":
					tempArray[j] = 8;

					break;
				case "fire enchanted":
					tempArray[j] = 9;

					break;
				case "lightning enchanted":
					tempArray[j] = 17;

					break;
				case "cold enchanted":
					tempArray[j] = 18;

					break;
				case "mana burn":
					tempArray[j] = 25;

					break;
				case "teleportation":
					tempArray[j] = 26;

					break;
				case "spectral hit":
					tempArray[j] = 27;

					break;
				case "stone skin":
					tempArray[j] = 28;

					break;
				case "multiple shots":
					tempArray[j] = 29;

					break;
				}
			}

			for (j = 0; j < tempArray.length; j += 1) {
				if (!unit.getEnchant(tempArray[j])) {
					break;
				}
			}

			if (j === tempArray.length) {
				//print("Skip Enchanted: " + unit.name);

				return false;
			}
		}

		// ImmuneLoop: // Skip immune monsters
		for (i = 0; i < Config.SkipImmune.length; i += 1) {
			tempArray = Config.SkipImmune[i].toLowerCase().split(" and ");

			for (j = 0; j < tempArray.length; j += 1) {
				if (this.checkResist(unit, tempArray[j])) { // Infinity calculations are built-in
					break;
				}
			}

			if (j === tempArray.length) {
				return false;
			}
		}

		// AuraLoop: // Skip monsters with auras
		for (i = 0; i < Config.SkipAura.length; i += 1) {
			rval = true;

			switch (Config.SkipAura[i].toLowerCase()) {
			case "fanaticism":
				if (unit.getState(49)) {
					rval = false;
				}

				break;
			case "might":
				if (unit.getState(33)) {
					rval = false;
				}

				break;
			case "holy fire":
				if (unit.getState(35)) {
					rval = false;
				}

				break;
			case "blessed aim":
				if (unit.getState(40)) {
					rval = false;
				}

				break;
			case "conviction":
				if (unit.getState(28)) {
					rval = false;
				}

				break;
			case "holy freeze":
				if (unit.getState(43)) {
					rval = false;
				}

				break;
			case "holy shock":
				if (unit.getState(46)) {
					rval = false;
				}

				break;
			}

			if (!rval) {
				return false;
			}
		}

		return true;
	},

	// Get element by skill number
	getSkillElement: function (skillId) {
		this.elements = ["physical", "fire", "lightning", "magic", "cold", "poison", "none"];

		switch (skillId) {
		case 74: // Corpse Explosion
		case 144: // Concentrate
		case 147: // Frenzy
		case 273: // Minge Blast
		case 500: // Summoner
			return "physical";
		case 101: // Holy Bolt
			return "holybolt"; // no need to use this.elements array because it returns before going over the array
		}

		let eType = getBaseStat("skills", skillId, "etype");

		if (typeof (eType) === "number") {
			return this.elements[eType];
		}

		return false;
	},

	// Get a monster's resistance to specified element
	getResist: function (unit, type) {
		// some scripts pass empty units in throne room
		if (!unit || !unit.getStat) return 100;
		
		// player
		if (unit.type === sdk.unittype.Player) return 0;

		switch (type) {
		case "physical":
			return unit.getStat(36);
		case "fire":
			return unit.getStat(39);
		case "lightning":
			return unit.getStat(41);
		case "magic":
			return unit.getStat(37);
		case "cold":
			return unit.getStat(43);
		case "poison":
			return unit.getStat(45);
		case "none":
			return 0;
		case "holybolt": // check if a monster is undead
			if (getBaseStat("monstats", unit.classid, "lUndead") || getBaseStat("monstats", unit.classid, "hUndead")) {
				return 0;
			}

			return 100;
		}

		return 100;
	},

	// Check if a monster is immune to specified attack type
	checkResist: function (unit, val, maxres) {
		if (unit.type === sdk.unittype.Player) return true;
		
		maxres === undefined && (maxres = 100);
		let damageType = typeof val === "number" ? this.getSkillElement(val) : val;

		// Static handler
		if (val === 42 && this.getResist(unit, damageType) < 100) {
			return (unit.hpPercent > Config.CastStatic);
		}

		if (this.infinity && ["fire", "lightning", "cold"].indexOf(damageType) > -1 && unit.getState) { // baal in throne room doesn't have getState
			if (!unit.getState(28)) {
				return this.getResist(unit, damageType) < 117;
			}

			return this.getResist(unit, damageType) < maxres;
		}

		return this.getResist(unit, damageType) < maxres;
	},

	// Check if we have valid skills to attack a monster
	canAttack: function (unit) {
		if (unit.type === 1) {
			if (unit.spectype & 0x7) { // Unique/Champion
				if (Attack.checkResist(unit, this.getSkillElement(Config.AttackSkill[1])) || Attack.checkResist(unit, this.getSkillElement(Config.AttackSkill[2]))) {
					return true;
				}
			} else {
				if (Attack.checkResist(unit, this.getSkillElement(Config.AttackSkill[3])) || Attack.checkResist(unit, this.getSkillElement(Config.AttackSkill[4]))) {
					return true;
				}
			}

			if (Config.AttackSkill.length === 7) {
				return Attack.checkResist(unit, this.getSkillElement(Config.AttackSkill[5])) || Attack.checkResist(unit, this.getSkillElement(Config.AttackSkill[6]));
			}
		}

		return false;
	},

	// Detect use of bows/crossbows
	usingBow: function () {
		let item = me.getItem(-1, 1);

		if (item) {
			do {
				if (item.bodylocation === 4 || item.bodylocation === 5) {
					switch (item.itemType) {
					case 27: // Bows
					case 85: // Amazon Bows
						return "bow";
					case 35: // Crossbows
						return "crossbow";
					}
				}
			} while (item.getNext());
		}

		return false;
	},

	// Find an optimal attack position and move or walk to it
	getIntoPosition: function (unit, distance, coll, walk) {
		if (!unit || !unit.x || !unit.y) {
			return false;
		}

		if (walk === true) {
			walk = 1;
		}

		if (distance < 4 && (!unit.hasOwnProperty("mode") || (unit.mode !== 0 && unit.mode !== 12))) {
			//me.overhead("Short range");

			if (walk) {
				if (getDistance(me, unit) > 8 || checkCollision(me, unit, coll)) {
					Pather.walkTo(unit.x, unit.y, 3);
				}
			} else {
				Pather.moveTo(unit.x, unit.y, 0);
			}

			return !CollMap.checkColl(me, unit, coll);
		}

		let n, i, cx, cy,
			coords = [],
			fullDistance = distance,
			name = unit.hasOwnProperty("name") ? unit.name : "",
			angle = Math.round(Math.atan2(me.y - unit.y, me.x - unit.x) * 180 / Math.PI),
			angles = [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 135, -135, 180];

		//let t = getTickCount();

		for (n = 0; n < 3; n += 1) {
			if (n > 0) {
				distance -= Math.floor(fullDistance / 3 - 1);
			}

			for (i = 0; i < angles.length; i += 1) {
				cx = Math.round((Math.cos((angle + angles[i]) * Math.PI / 180)) * distance + unit.x);
				cy = Math.round((Math.sin((angle + angles[i]) * Math.PI / 180)) * distance + unit.y);

				if (Pather.checkSpot(cx, cy, 0x1, false)) {
					coords.push({x: cx, y: cy});
				}
			}

			//print("ÿc9potential spots: ÿc2" + coords.length);

			if (coords.length > 0) {
				coords.sort(Sort.units);

				for (i = 0; i < coords.length; i += 1) {
					// Valid position found
					if (!CollMap.checkColl({x: coords[i].x, y: coords[i].y}, unit, coll, 1)) {
						//print("ÿc9optimal pos build time: ÿc2" + (getTickCount() - t) + " ÿc9distance from target: ÿc2" + getDistance(cx, cy, unit.x, unit.y));

						switch (walk) {
						case 1:
							Pather.walkTo(coords[i].x, coords[i].y, 2);

							break;
						case 2:
							if (getDistance(me, coords[i]) < 6 && !CollMap.checkColl(me, coords[i], 0x5)) {
								Pather.walkTo(coords[i].x, coords[i].y, 2);
							} else {
								Pather.moveTo(coords[i].x, coords[i].y, 1);
							}

							break;
						default:
							Pather.moveTo(coords[i].x, coords[i].y, 1);

							break;
						}

						return true;
					}
				}
			}
		}

		if (name) {
			print("ÿc4Attackÿc0: No valid positions for: " + name);
		}

		return false;
	}
};
