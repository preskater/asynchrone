import {
  ANIMATION_EFFECTS,
  customThemeVariables,
  EFFECT_ATTRIBUTES,
  type OrganizationAppearance,
} from "./appearance-types"

/** localStorage key that scopes accessibility preferences per user. */
export function userAppearanceStorageKey(userId: string) {
  return `asynchrone-space.appearance.user.${userId}`
}

/**
 * Inline script that applies the organization theme and the user's
 * accessibility preferences before the first paint. It runs from the server
 * layout (not from a React client component) so it also works on hard
 * navigations without a flash of the default look.
 */
export function appearanceBootScript(
  appearance: OrganizationAppearance,
  userId: string
) {
  const config = JSON.stringify({
    appearance,
    effects: ANIMATION_EFFECTS.map((effect) => [
      EFFECT_ATTRIBUTES[effect],
      appearance.animations.effects[effect],
    ]),
    customVariables:
      appearance.theme === "custom"
        ? customThemeVariables(appearance.custom)
        : null,
  })
  const key = JSON.stringify(userAppearanceStorageKey(userId))

  return `(function(){try{
var c=${config};
var r=document.documentElement;
r.setAttribute("data-org-theme",c.appearance.theme);
r.setAttribute("data-motion-level",c.appearance.animations.level);
for(var i=0;i<c.effects.length;i++){r.setAttribute(c.effects[i][0],c.effects[i][1]?"on":"off")}
if(c.customVariables){for(var k in c.customVariables){r.style.setProperty(k,c.customVariables[k])}}
var p={};
try{p=JSON.parse(localStorage.getItem(${key})||"{}")}catch(e){}
r.setAttribute("data-motion",p.disableAnimations?"off":"on");
r.setAttribute("data-contrast",p.highContrast?"high":"normal");
}catch(e){}})();`
}
