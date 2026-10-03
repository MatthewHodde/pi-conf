#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const THEME_DIR = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH =
	process.env.PI_THEME_SCHEMA ??
	"/root/.local/share/mise/installs/npm-earendil-works-pi-coding-agent/1/node_modules/.mise/@earendil-works+pi-coding-agent@1.0.0/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme-schema.json";
const THEME_FILES = ["light-distinct.json", "dark-distinct.json"];
const MIN_CONTRAST = 4.5;
const MIN_LIGHTNESS_DELTA = 0.05;
const MIN_SEPARATION = 1.5;
const TOOL_BG_KEYS = ["toolPendingBg", "toolSuccessBg", "toolErrorBg"];
const USER_MESSAGE_TEXT_ROLES = ["mdHeading", "mdLink", "mdLinkUrl", "mdCode", "mdQuote", "mdQuoteBorder", "mdListBullet", "mdCodeBlock", "mdCodeBlockBorder", "mdHr", "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable", "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator", "syntaxPunctuation"];

const failures = [];
function check(step, ok, message) {
	if (!ok) failures.push(`${step}: ${message}`);
}

// --- color math mirrored from pi's dist bundle so measurements match the app exactly ---
const LINEAR_SRGB_TO_LMS = [[0.4122214694707629, 0.5363325372617349, 0.0514459932675022], [0.2119034958178251, 0.6806995506452344, 0.1073969535369405], [0.0883024591900564, 0.2817188391361215, 0.6299787016738222]];
const LMS_TO_LAB = [[0.210454268309314, 0.793617774702305, -0.0040720430116193], [1.9779985324311684, -2.42859224204858, 0.450593709617411], [0.0259040424655478, 0.7827717124575296, -0.8086757549230774]];
const LAB_TO_LMS = [[1, 0.3963377773761749, 0.2158037573099136], [1, -0.1055613458156586, -0.0638541728258133], [1, -0.0894841775298119, -1.2914855480194092]];
const LMS_TO_LINEAR_SRGB = [[4.076741636075958, -3.307711539258063, 0.2309699031821043], [-1.2684379732850315, 2.609757349287688, -0.341319376002657], [-0.0041960761386756, -0.7034186179359362, 1.7076146940746117]];
const SATURATION_FIT = [
	[[-1.8817031, -0.80936501], [1.19086277, 1.76576728, 0.59662641, 0.75515197, 0.56771245]],
	[[1.8144408, -1.19445267], [0.73956515, -0.45954404, 0.08285427, 0.12541073, -0.14503204]],
	[[0.13110758, 1.81333971], [1.35733652, -0.00915799, -1.1513021, -0.50559606, 0.00692167]],
];
const K1 = 0.206;
const K2 = 0.03;
const K3 = (1 + K1) / (1 + K2);

const multiply = (matrix, vector) => matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]);
const srgbToLinear = (value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (value) => (value > 0.0031308 ? 1.055 * value ** (1 / 2.4) - 0.055 : 12.92 * value);

function oklabToLinearSrgb([l, a, b]) {
	const lms = multiply(LAB_TO_LMS, [l, a, b]).map((value) => value ** 3);
	return multiply(LMS_TO_LINEAR_SRGB, lms);
}
function linearSrgbToOklab(rgb) {
	const cbrt = multiply(LINEAR_SRGB_TO_LMS, rgb).map(Math.cbrt);
	return multiply(LMS_TO_LAB, cbrt);
}
function linearSrgbToRgb(linear) {
	const [r, g, b] = linear.map((value) => Math.round(Math.min(1, Math.max(0, linearToSrgb(value))) * 255));
	return { r, g, b };
}
function lmsSlopes(a, b) {
	return LAB_TO_LMS.map((row) => row[1] * a + row[2] * b);
}
function maxSaturation(a, b) {
	const channel = SATURATION_FIT.findIndex(([[x, y]], index) => index === 2 || x * a + y * b > 1);
	const [k0, k1, k2, k3, k4] = SATURATION_FIT[channel][1];
	const weights = LMS_TO_LINEAR_SRGB[channel];
	let saturation = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b;
	const slopes = lmsSlopes(a, b);
	const base = slopes.map((slope) => 1 + saturation * slope);
	const dot = (values) => values.reduce((sum, value, index) => sum + value * weights[index], 0);
	const f2 = dot(base.map((value) => value ** 3));
	const f1 = dot(base.map((value, index) => 3 * slopes[index] * value ** 2));
	const f22 = dot(base.map((value, index) => 6 * slopes[index] ** 2 * value));
	return saturation - (f2 * f1) / (f1 * f1 - 0.5 * f2 * f22);
}
function cusp(a, b) {
	const saturation = maxSaturation(a, b);
	const lightness = Math.cbrt(1 / Math.max(...oklabToLinearSrgb([1, saturation * a, saturation * b])));
	return [lightness, lightness * saturation];
}
function maxChroma(a, b, lightness, [cuspL, cuspC]) {
	if (lightness <= cuspL) return (cuspC * lightness) / cuspL;
	const t = (cuspC * (lightness - 1)) / (cuspL - 1);
	const slopes = lmsSlopes(a, b);
	const lms = slopes.map((slope) => lightness + t * slope);
	const cubes = lms.map((value) => value ** 3);
	const first = lms.map((value, index) => 3 * slopes[index] * value ** 2);
	const second = lms.map((value, index) => 6 * slopes[index] ** 2 * value);
	const dot = (row, values) => row[0] * values[0] + row[1] * values[1] + row[2] * values[2];
	const steps = LMS_TO_LINEAR_SRGB.map((row) => {
		const f2 = dot(row, cubes) - 1;
		const f1 = dot(row, first);
		const f22 = dot(row, second);
		const u = f1 / (f1 * f1 - 0.5 * f2 * f22);
		return u >= 0 ? -f2 * u : Number.MAX_VALUE;
	});
	return t + Math.min(...steps);
}
function chromaStops(L, a, b) {
	const peak = cusp(a, b);
	const cMax = maxChroma(a, b, L, peak);
	const k = cMax / Math.min((L * peak[1]) / peak[0], ((1 - L) * peak[1]) / (1 - peak[0]));
	const midS = 0.11516993 + 1 / (7.4477897 + 4.1590124 * b + a * (-2.19557347 + 1.75198401 * b + a * (-2.13704948 - 10.02301043 * b + a * (-4.24894561 + 5.38770819 * b + 4.69891013 * a))));
	const midT = 0.11239642 + 1 / (1.6132032 - 0.68124379 * b + a * (0.40370612 + 0.90148123 * b + a * (-0.27087943 + 0.6122399 * b + a * (0.00299215 - 0.45399568 * b - 0.14661872 * a))));
	const cMid = 0.9 * k * Math.sqrt(Math.sqrt(1 / (1 / (L * midS) ** 4 + 1 / ((1 - L) * midT) ** 4)));
	return [Math.sqrt(1 / (1 / (L * 0.4) ** 2 + 1 / ((1 - L) * 0.8) ** 2)), cMid, cMax];
}
function okhslToRgb(hue, saturation, lightness) {
	const L = (lightness * lightness + K1 * lightness) / (K3 * (lightness + K2));
	let lab = [L, 0, 0];
	if (L > 0 && L < 1 && saturation > 0) {
		const angle = (2 * Math.PI * (((hue % 360) + 360) % 360)) / 360;
		const a = Math.cos(angle);
		const b = Math.sin(angle);
		const [c0, cMid, cMax] = chromaStops(L, a, b);
		let chroma;
		if (saturation < 0.8) {
			const t = 1.25 * saturation;
			const k = 0.8 * c0;
			chroma = (t * k) / (1 - (1 - k / cMid) * t);
		} else {
			const t = 5 * (saturation - 0.8);
			const k = (0.2 * cMid ** 2 * 1.25 ** 2) / c0;
			chroma = cMid + (t * k) / (1 - (1 - k / (cMax - cMid)) * t);
		}
		lab = [L, chroma * a, chroma * b];
	}
	return linearSrgbToRgb(oklabToLinearSrgb(lab));
}
function isInSrgbGamut(linear) {
	return linear.every((channel) => channel >= -1e-7 && channel <= 1 + 1e-7);
}
function oklchToRgb({ l, c, h }) {
	const radians = (h * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	const atChroma = (chroma) => oklabToLinearSrgb([l, chroma * cos, chroma * sin]);
	const direct = atChroma(c);
	if (isInSrgbGamut(direct)) return linearSrgbToRgb(direct);
	let linear = atChroma(0);
	let low = 0;
	let high = c;
	for (let index = 0; index < 20; index++) {
		const chroma = (low + high) / 2;
		const candidate = atChroma(chroma);
		if (isInSrgbGamut(candidate)) {
			low = chroma;
			linear = candidate;
		} else {
			high = chroma;
		}
	}
	return linearSrgbToRgb(linear);
}
function indexedToRgb(index) {
	const BASIC = [[0, 0, 0], [128, 0, 0], [0, 128, 0], [128, 128, 0], [0, 0, 128], [128, 0, 128], [0, 128, 128], [192, 192, 192], [128, 128, 128], [255, 0, 0], [0, 255, 0], [255, 255, 0], [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255]];
	const CUBE = [0, 95, 135, 175, 215, 255];
	if (index < 16) return { r: BASIC[index][0], g: BASIC[index][1], b: BASIC[index][2] };
	if (index < 232) {
		const cube = index - 16;
		return { r: CUBE[Math.floor(cube / 36)], g: CUBE[Math.floor((cube % 36) / 6)], b: CUBE[cube % 6] };
	}
	const gray = 8 + (index - 232) * 10;
	return { r: gray, g: gray, b: gray };
}

const NUMBER_PATTERN = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
const OKLCH_PATTERN = new RegExp(`^oklch\\(\\s*(${NUMBER_PATTERN})(%)?\\s+(${NUMBER_PATTERN})\\s+(${NUMBER_PATTERN})(?:deg)?\\s*\\)$`, "i");
// OKHSL parameter order is (hue deg, saturation %, lightness %) — the reverse of OKLCH's (lightness, chroma, hue deg).
const OKHSL_PATTERN = new RegExp(`^okhsl\\(\\s*(${NUMBER_PATTERN})(?:deg)?\\s+(${NUMBER_PATTERN})(%)?\\s+(${NUMBER_PATTERN})(%)?\\s*\\)$`, "i");

function resolveVarRefs(value, vars, visited = new Set()) {
	if (typeof value === "number") return value;
	if (typeof value !== "string") throw new Error(`expected a string or 0-255 index, got ${JSON.stringify(value)}`);
	if (value === "" || value.startsWith("#") || /^ok(lch|hsl)\(/i.test(value)) return value;
	if (visited.has(value)) throw new Error(`circular variable reference: ${value}`);
	if (!(value in vars)) throw new Error(`variable reference not found: ${value}`);
	visited.add(value);
	return resolveVarRefs(vars[value], vars, visited);
}
function parseColor(value) {
	if (typeof value === "number") {
		if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error(`256-color index out of range: ${value}`);
		return indexedToRgb(value);
	}
	if (value === "") return undefined;
	const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(value);
	if (hex) {
		const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join("") : hex[1];
		return { r: Number.parseInt(digits.slice(0, 2), 16), g: Number.parseInt(digits.slice(2, 4), 16), b: Number.parseInt(digits.slice(4, 6), 16) };
	}
	const oklch = OKLCH_PATTERN.exec(value);
	if (oklch) {
		const lightness = Number.parseFloat(oklch[1]) / (oklch[2] ? 100 : 1);
		return oklchToRgb({ l: lightness, c: Number.parseFloat(oklch[3]), h: Number.parseFloat(oklch[4]) });
	}
	const okhsl = OKHSL_PATTERN.exec(value);
	if (okhsl) {
		const saturation = Number.parseFloat(okhsl[2]) / (okhsl[3] ? 100 : 1);
		const lightness = Number.parseFloat(okhsl[4]) / (okhsl[5] ? 100 : 1);
		return okhslToRgb(Number.parseFloat(okhsl[1]), saturation, lightness);
	}
	throw new Error(`unsupported color value: ${value}`);
}
function oklchOf(rgb) {
	const [l, a, b] = linearSrgbToOklab([rgb.r / 255, rgb.g / 255, rgb.b / 255].map(srgbToLinear));
	return { l, c: Math.hypot(a, b), h: (((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360 };
}
function hexOf({ r, g, b }) {
	return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}
function relativeLuminance({ r, g, b }) {
	const toLinear = (c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
function contrastRatio(first, second) {
	const a = relativeLuminance(first);
	const b = relativeLuminance(second);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf-8"));
const requiredColorKeys = schema.properties.colors.required;
const rows = [];

for (const fileName of THEME_FILES) {
	const step = fileName;
	const failuresBeforeFile = failures.length;
	let theme;
	try {
		theme = JSON.parse(readFileSync(join(THEME_DIR, fileName), "utf-8"));
	} catch (error) {
		check("load", false, `${fileName} is not valid JSON: ${error.message}`);
		continue;
	}
	const stem = fileName.replace(/\.json$/, "");

	check("name", typeof theme.name === "string" && !theme.name.includes("/"), `${step}: name must not contain "/": ${JSON.stringify(theme.name)}`);
	check("name", theme.name !== "system", `${step}: name must not be "system": ${JSON.stringify(theme.name)}`);
	check("name", theme.name === stem, `${step}: name ${JSON.stringify(theme.name)} must equal filename stem ${JSON.stringify(stem)}`);

	const colors = theme.colors ?? {};
	const vars = theme.vars ?? {};
	const resolved = {};
	for (const key of requiredColorKeys) {
		check("schema", key in colors, `${step}: colors.${key} is missing from theme-schema.json /colors`);
		if (!(key in colors)) continue;
		try {
			resolved[key] = resolveVarRefs(colors[key], vars);
		} catch (error) {
			check("schema", false, `${step}: colors.${key} failed to resolve: ${error.message}`);
		}
	}
	for (const [key, value] of Object.entries(resolved)) {
		try {
			parseColor(value);
		} catch (error) {
			check("schema", false, `${step}: colors.${key} failed to parse: ${error.message}`);
		}
	}
	if (failures.length > failuresBeforeFile) continue;

	const rgbOf = (key) => parseColor(resolved[key]);
	const userBgRaw = resolved.userMessageBg;
	const userTextRaw = resolved.userMessageText;
	const userBg = rgbOf("userMessageBg");
	const userText = rgbOf("userMessageText");
	if (!userBg || !userText) {
		check("contrast", false, `${step}: userMessageBg/userMessageText must resolve to concrete colors (got ${JSON.stringify(userBgRaw)} / ${JSON.stringify(userTextRaw)})`);
		continue;
	}
	const contrast = contrastRatio(userText, userBg);
	check("contrast", contrast >= MIN_CONTRAST, `${step}: WCAG contrast of colors.userMessageText (${userTextRaw} -> ${hexOf(userText)}) on colors.userMessageBg (${userBgRaw} -> ${hexOf(userBg)}) is ${contrast.toFixed(2)}, minimum ${MIN_CONTRAST}`);

	for (const role of USER_MESSAGE_TEXT_ROLES) {
		const roleRaw = resolved[role];
		const roleRgb = parseColor(roleRaw);
		const roleContrast = contrastRatio(roleRgb, userBg);
		check("contrast", roleContrast >= MIN_CONTRAST, `${step}: WCAG contrast of colors.${role} (${roleRaw} -> ${hexOf(roleRgb)}) on colors.userMessageBg (${userBgRaw} -> ${hexOf(userBg)}) is ${roleContrast.toFixed(2)}, minimum ${MIN_CONTRAST}`);
	}

	// A role that hugs body text passes contrast yet looks like body text. Keep every panel role distinguishable.
	for (const role of USER_MESSAGE_TEXT_ROLES) {
		const roleRaw = resolved[role];
		const roleRgb = parseColor(roleRaw);
		const separation = contrastRatio(roleRgb, userText);
		check("separation", separation >= MIN_SEPARATION, `${step}: contrast of colors.${role} (${hexOf(roleRgb)}) vs colors.userMessageText (${hexOf(userText)}) is ${separation.toFixed(2)}, minimum ${MIN_SEPARATION}`);
	}

	const userL = oklchOf(userBg).l;
	const deltas = {};
	for (const key of TOOL_BG_KEYS) {
		const toolL = oklchOf(rgbOf(key)).l;
		deltas[key] = Math.abs(userL - toolL);
		check("separation", deltas[key] >= MIN_LIGHTNESS_DELTA, `${step}: OKLCH lightness delta userMessageBg (${userL.toFixed(4)}) vs ${key} (${toolL.toFixed(4)}) is ${deltas[key].toFixed(4)}, minimum ${MIN_LIGHTNESS_DELTA}`);
	}
	const titleText = rgbOf("toolTitle");
	const titleContrasts = {};
	for (const key of TOOL_BG_KEYS) {
		const toolBg = rgbOf(key);
		if (!titleText || !toolBg) {
			check("title-contrast", false, `${step}: colors.toolTitle and colors.${key} must resolve to concrete colors`);
			continue;
		}
		titleContrasts[key] = contrastRatio(titleText, toolBg);
		check("title-contrast", titleContrasts[key] >= MIN_CONTRAST, `${step}: WCAG contrast of colors.toolTitle (${hexOf(titleText)}) on colors.${key} (${hexOf(toolBg)}) is ${titleContrasts[key].toFixed(2)}, minimum ${MIN_CONTRAST}`);
	}
	rows.push({ theme: stem, userBgRaw, userBgHex: hexOf(userBg), userTextRaw, userTextHex: hexOf(userText), contrast, userL, deltas, minDelta: Math.min(...Object.values(deltas)), minTitleContrast: Math.min(...Object.values(titleContrasts)) });
}

console.log("theme          userMessageBg (raw -> hex)            userMessageText (raw -> hex)   contrast  titleC  okL(userBg)  ΔL pending/success/error");
for (const row of rows) {
	const bg = `${row.userBgRaw} -> ${row.userBgHex}`.padEnd(35);
	const text = `${row.userTextRaw} -> ${row.userTextHex}`.padEnd(30);
	const delta = `${row.deltas.toolPendingBg.toFixed(4)}/${row.deltas.toolSuccessBg.toFixed(4)}/${row.deltas.toolErrorBg.toFixed(4)}`;
	console.log(`${row.theme.padEnd(14)} ${bg} ${text} ${row.contrast.toFixed(2).padStart(7)}  ${row.minTitleContrast.toFixed(2).padStart(6)}  ${row.userL.toFixed(4).padStart(10)}  ${delta}`);
}
console.log(`checks: panel contrasts >= ${MIN_CONTRAST}, each OKLCH lightness delta >= ${MIN_LIGHTNESS_DELTA}`);

if (failures.length) {
	console.error(`\nFAILED (${failures.length} assertion${failures.length === 1 ? "" : "s"}):`);
	for (const failure of failures) console.error(`  FAIL ${failure}`);
	process.exit(1);
}
console.log("\nPASS: all assertions hold for both themes");
