"""
One-off data-generation script for the "intercepted transmissions" archive.

Design choice (documented per project spec): messages are PRE-ENCRYPTED
here and the result is written to app/data/messages.json as static
fixture data. The FastAPI backend only ever reads that JSON file at
request time — it does not re-encrypt anything or hold any server-side
session state. The true key and original plaintext are stored in the
JSON so the UI can offer an explicit "reveal" action, but the /api/messages
list endpoint strips both fields before sending anything to the client.

All paragraphs below are entirely fictional (invented place names, unit
names, and operation codenames) written for this course project — they
do not describe any real historical event, unit, or operation.

Run with:  python3 generate_data.py   (from the backend/ directory)
"""

from __future__ import annotations

import json
import random
from pathlib import Path

from app.cipher import encrypt, normalize_text

random.seed(1943)  # deterministic output across re-runs

DATA_DIR = Path(__file__).parent / "app" / "data"

# (title, key, fictional WWII-style paragraph)
MESSAGES: list[tuple[str, str, str]] = [
    (
        "Convoy Movement Report",
        "RAVEN",
        "Command this is Falcon Nest stop enemy convoy of twelve vessels spotted "
        "moving northeast from Port Meridian at dawn stop escort appears limited "
        "to three destroyers and one light cruiser stop recommend immediate aerial "
        "reconnaissance before the convoy reaches the northern narrows stop fuel "
        "reserves at the harbor appear low based on reduced smoke output from the "
        "refinery stacks stop awaiting further instructions from high command stop "
        "end transmission",
    ),
    (
        "Resistance Network Contact",
        "GHOST",
        "To the keeper of the western orchard from the traveling clockmaker stop the "
        "shipment of watches will arrive at the old mill three nights after the new "
        "moon stop count must match exactly or the delivery will be turned back at "
        "the crossing stop tell the baker his cousin is well and sends bread stop "
        "burn this message after reading and reply only through the usual channel "
        "stop may the roads stay quiet",
    ),
    (
        "Fuel Depot Coordinates",
        "IRON",
        "Field report from listening post seven stop enemy fuel depot located two "
        "kilometers south of the stone bridge near Hollow Creek stop estimated "
        "capacity forty thousand liters stored in six above ground tanks stop guard "
        "rotation changes every four hours with minimal patrol between midnight and "
        "dawn stop terrain to the east offers good cover for an approach stop "
        "request confirmation before any strike is authorized",
    ),
    (
        "Weather Window for Air Support",
        "STORM",
        "Meteorological officer reporting stop cloud ceiling over the eastern valley "
        "expected to lift by midmorning tomorrow stop visibility should reach eight "
        "kilometers by noon with light winds from the northwest stop a second front "
        "is forecast to arrive within forty eight hours bringing heavy rain and low "
        "cloud stop recommend scheduling the air support mission inside the clear "
        "window rather than waiting stop conditions after that will not favor "
        "accurate bombing",
    ),
    (
        "Troop Redeployment Order",
        "EAGLE",
        "Third battalion is to withdraw from the ridge position under cover of "
        "darkness and move to the reserve line behind Miller Hill stop leave a "
        "small screening force to maintain the appearance of full strength stop "
        "artillery support will continue on the previous schedule to avoid drawing "
        "attention to the withdrawal stop new positions must be fully occupied and "
        "camouflaged before first light stop confirm receipt of these orders "
        "immediately",
    ),
    (
        "Prisoner Exchange Rumor",
        "COMPASS",
        "Unconfirmed report from a source inside the southern camp suggests an "
        "exchange of captured officers is being discussed through neutral "
        "intermediaries stop numbers mentioned range from twenty to thirty on each "
        "side stop location has not been settled but the river crossing near the "
        "old chapel has been suggested stop treat this information with caution "
        "until a second source can confirm the details stop will update as more "
        "becomes known",
    ),
    (
        "Bridge Demolition Plan",
        "SENTRY",
        "Engineers have completed their survey of the river bridge north of "
        "Ashford stop charges can be placed at the two central support piers with "
        "minimal risk of detection stop demolition would delay any enemy advance "
        "along this route by at least five days stop recommend timing the charge "
        "to coincide with the planned diversion at the crossroads stop request "
        "authorization to proceed once the diversion team confirms readiness stop "
        "standing by for orders",
    ),
    (
        "Listening Post Signal Log",
        "ANCHOR",
        "Overnight intercepts show a marked increase in radio traffic between the "
        "coastal battery and the regional headquarters stop several messages were "
        "sent in an unfamiliar cipher and could not be read stop volume of traffic "
        "suggests preparations for a larger movement in the coming days stop "
        "direction finding places the strongest signal near the lighthouse ruins "
        "stop recommend increasing monitoring shifts until the pattern becomes "
        "clear stop nothing further to report at this hour",
    ),
    (
        "Decoy Operation Briefing",
        "SHADOW",
        "The plan for the diversion at Thistle Crossing calls for a small unit to "
        "simulate a larger force through radio chatter and staged movement after "
        "dark stop dummy vehicles will be positioned along the tree line before "
        "dawn to draw reconnaissance attention away from the true crossing point "
        "stop timing is critical and must align with the main force departure "
        "stop any deviation from schedule should be reported immediately through "
        "the emergency frequency stop good luck to all involved",
    ),
    (
        "High Command Directive",
        "VICTORY",
        "All unit commanders are reminded that radio silence is to be observed "
        "between the hours of twenty two hundred and zero five hundred until "
        "further notice stop any transmission required during this window must be "
        "authorized by division headquarters in advance stop this measure is "
        "intended to reduce the risk of enemy direction finding ahead of the "
        "planned movement stop violations will be reported directly to command "
        "stop acknowledge receipt of this directive by return signal",
    ),
    (
        "Supply Shortage Warning",
        "WOLFPACK",
        "Quartermaster reports that boot and uniform stocks at the forward depot "
        "will be exhausted within two weeks at the current rate of issue stop "
        "requests for resupply sent three weeks ago have not yet been answered by "
        "regional command stop medical supplies are similarly low particularly "
        "bandages and antiseptic stop recommend prioritizing the next transport "
        "convoy for these items over less urgent cargo stop morale among the "
        "troops remains steady despite the shortages",
    ),
    (
        "Coastal Patrol Sighting",
        "HARBOR",
        "Patrol boat four reports a surfaced submarine of unknown origin sighted "
        "briefly near the outer buoy line before diving stop no markings were "
        "visible in the limited light stop course at time of sighting was roughly "
        "southwest away from the harbor mouth stop no torpedo wake was observed "
        "and no attack appears to have been intended stop all coastal batteries "
        "have been placed on heightened alert until the situation is clarified "
        "stop further sightings will be reported without delay",
    ),
    (
        "Encoded Recruitment Message",
        "PHOENIX",
        "The gardener sends word that new seeds have arrived and are ready for "
        "planting whenever the ground is prepared stop three young volunteers from "
        "the northern village wish to join the effort and await instructions on "
        "where to meet stop the usual caution applies regarding strangers asking "
        "about the harvest stop supplies of ink and paper are running low and "
        "should be replenished through the trusted merchant stop the season "
        "continues to favor our work",
    ),
    (
        "Damage Assessment Report",
        "BASTION",
        "Reconnaissance photographs taken this morning confirm significant damage "
        "to the rail yard following last night's raid stop at least four storage "
        "sheds appear destroyed and the main turntable is likely inoperable stop "
        "the western spur line remains intact and could allow limited traffic "
        "within days stop recommend a follow up strike targeting the repair crews "
        "and replacement materials before reconstruction can begin stop full "
        "written report to follow by courier",
    ),
    (
        "Flash Traffic - Ford Crossing",
        "FORT",
        "Flash traffic stop bridge at Kestrel Ford is mined stop do not cross "
        "before dawn stop await green flare stop end",
    ),
    (
        "Weekly Situation Report",
        "SIGNAL",
        "Weekly situation report from the northern sector headquarters covering the "
        "seven days ending at midnight on the last day of the period stop overall "
        "activity along the front remained moderate with no significant change to "
        "the line held by either side stop enemy patrols were observed on four "
        "separate nights probing the approaches to Willow Ridge but withdrew "
        "without engaging when challenged by our forward posts stop artillery fire "
        "from the enemy side was lighter than the previous week and appeared to be "
        "directed mainly at the road junction east of the village rather than at "
        "our positions stop supply convoys reached the forward depot on schedule "
        "on five of seven days with the two delays attributed to washed out "
        "sections of the coastal road following heavy rain stop engineers report "
        "that the temporary crossing at Ashford is now able to bear light vehicle "
        "traffic and work continues on strengthening it for heavier loads stop "
        "medical returns show a small rise in cases of trench foot which the "
        "senior medical officer attributes to the wet conditions and the shortage "
        "of dry socks noted in the previous report stop morale is assessed as "
        "satisfactory with mail from home now arriving regularly since the "
        "restoration of the rail link stop the listening post at the lighthouse "
        "ruins intercepted a marked increase in enemy radio traffic during the "
        "final two days of the period and analysis of the pattern is continuing "
        "stop intelligence section assesses that the enemy may be preparing to "
        "relieve the units currently facing us though no firm evidence has yet "
        "been obtained stop recommendations for the coming week are to maintain "
        "the current posture increase night patrolling on the ridge approaches "
        "and press regional command for the outstanding resupply of winter "
        "clothing before conditions deteriorate further stop end of report",
    ),
    (
        "Scrambled Directive",
        "XQZVKP",
        "Attention all stations this directive supersedes previous instructions "
        "regarding the handling of captured documents stop all papers recovered "
        "from enemy positions are to be forwarded unread and unopened to the "
        "intelligence section at divisional headquarters within twelve hours of "
        "capture stop under no circumstances are maps or codebooks to be retained "
        "by the capturing unit for any reason stop receipts will be issued for "
        "every item forwarded and commanders are responsible for ensuring nothing "
        "is lost in transit stop acknowledge this directive by return signal",
    ),
    # added 2026-11-03 (Mihai: an even 20 messages); appended so the existing ids stay the same
    (
        "Lighthouse Relay Schedule",
        "BEACON",
        "Keeper of the northern light to all coastal relay posts stop beginning "
        "tonight the lamp will burn for two long flashes and one short each hour "
        "to signal that the channel is clear stop three short flashes mean enemy "
        "patrol boats are inside the bay and all fishing boats must stay in the "
        "harbor stop if the lamp stays dark after midnight assume the station is "
        "taken and move the radio set to the chapel cellar stop confirm receipt",
    ),
    (
        "Mountain Pass Crossing",
        "LANTERN",
        "Guide party to the refugee column waiting at the shepherd huts stop the "
        "upper pass will be open for one night only when the border guards change "
        "their watch stop travel light and carry no papers that show your real "
        "names stop the second guide will wait at the frozen waterfall with warm "
        "coats and dry bread stop walk in single file and keep the children close "
        "stop if you hear dogs turn back to the huts and wait for the next signal",
    ),
    (
        "Factory Sabotage Report",
        "EMBER",
        "Cell leader to regional command stop the night shift at the ball bearing "
        "works completed the task without loss stop two of the four furnaces are "
        "cracked and the main conveyor will need new parts from the capital stop "
        "the guards suspect an accident because the fire started near the old "
        "fuel store stop our workers returned to their homes before the curfew "
        "stop production should stay below half for at least three weeks stop end",
    ),
]

# The four "test cases" surfaced by default in the UI. Each one exists to
# expose a different property of the three algorithms; the rest of the archive
# is still available behind "show all". The short message deliberately uses a
# 4-letter key so brute force succeeds somewhere in the default set.
FEATURED_CASES = {
    "Convoy Movement Report": "word-key",       # real word as key: dictionary attack wins, brute force fails
    "Scrambled Directive": "random-key",        # gibberish key: dictionary must fail
    "Flash Traffic - Ford Crossing": "short",   # too little text for frequency analysis; 4-letter key for brute force
    "Weekly Situation Report": "long",          # plenty of text: frequency analysis at its best
}
FEATURED_ORDER = ["word-key", "random-key", "short", "long"]


COMMON_WORDS = [
    "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER",
    "WAS", "ONE", "OUR", "OUT", "DAY", "GET", "HAS", "HIM", "HIS", "HOW",
    "MAN", "NEW", "NOW", "OLD", "SEE", "TWO", "WAY", "WHO", "BOY", "DID",
    "ITS", "LET", "PUT", "SAY", "SHE", "TOO", "USE", "TIME", "WORK", "BACK",
    "CALL", "CAME", "EACH", "FIND", "GIVE", "HAND", "HIGH", "KEEP", "KIND",
    "KNOW", "LAND", "LAST", "LEFT", "LIFE", "LIVE", "LOOK", "MADE", "MOST",
    "MOVE", "MUST", "NAME", "NEED", "NEXT", "ONLY", "OPEN", "OVER", "PART",
    "PLAY", "SAID", "SAME", "SEEM", "SHOW", "SIDE", "TAKE", "TELL", "THAN",
    "THAT", "THEM", "THEN", "THEY", "THIS", "TIME", "VERY", "WANT", "WELL",
    "WENT", "WERE", "WHAT", "WHEN", "WILL", "WITH", "WORD", "WORK", "YEAR",
    "ABOUT", "AFTER", "AGAIN", "BELOW", "COULD", "EVERY", "FIRST", "FOUND",
    "GREAT", "GROUP", "HOUSE", "LARGE", "LEARN", "NEVER", "OTHER", "PLACE",
    "PLANT", "POINT", "RIGHT", "SMALL", "SOUND", "SPELL", "STILL", "STUDY",
    "THEIR", "THERE", "THESE", "THING", "THINK", "THREE", "UNDER", "WATER",
    "WHERE", "WHICH", "WORLD", "WOULD", "WRITE", "ABOVE", "ALONG", "ALONE",
    "AMONG", "BEGIN", "BLACK", "BOARD", "BOTH", "BRING", "BUILD", "CARRY",
    "CLOSE", "COVER", "EARLY", "EARTH", "FIELD", "FINAL", "FORCE", "FRONT",
    "GUARD", "HEARD", "HEAVY", "HORSE", "HOTEL", "IMAGE", "LIGHT", "LOCAL",
    "MAJOR", "MEANS", "METAL", "MONTH", "NIGHT", "NORTH", "OFFER", "ORDER",
    "PAPER", "PIECE", "POWER", "PRESS", "QUIET", "RADIO", "RANGE", "REACH",
    "REACT", "READY", "RIVER", "ROUND", "ROUTE", "SENSE", "SHARP", "SHEET",
    "SHORT", "SIGHT", "SOUTH", "SPACE", "SPEED", "STAGE", "STAND", "START",
    "STATE", "STEEL", "STEEP", "STORE", "STORM", "STORY", "STYLE", "SUPPLY",
    "TABLE", "TIGHT", "TODAY", "TOTAL", "TOUCH", "TOWER", "TRACK", "TRAIN",
    "TREND", "TRUCK", "TRUST", "UNION", "UNTIL", "VALUE", "VOICE", "WATCH",
    "WHEEL", "WHOLE", "WOMAN", "YOUNG", "ACTION", "ADVICE", "ANIMAL",
    "ANSWER", "AROUND", "ATTACK", "BATTLE", "BEFORE", "BORDER", "BRIDGE",
    "BROKEN", "BUDGET", "CAMERA", "CAMP", "CASTLE", "CAUGHT", "CENTER",
    "CHANGE", "CHOICE", "CIRCLE", "COMBAT", "COMING", "COMMON", "CORNER",
    "COURSE", "DAMAGE", "DANGER", "DECIDE", "DEFEND", "DETAIL", "DEVICE",
    "DOUBLE", "DURING", "EASILY", "EFFORT", "ENERGY", "ENGINE", "ENOUGH",
    "ESCAPE", "EUROPE", "FAMILY", "FASTEN", "FIGURE", "FOREST", "FRIEND",
    "GARDEN", "GROUND", "HANDLE", "HAPPEN", "HARBOR", "HIDDEN", "ISLAND",
    "LETTER", "MANNER", "MEMBER", "METHOD", "MOMENT", "MOTHER", "MOTION",
    "NATION", "NATURE", "NORMAL", "NOTICE", "NUMBER", "OFFICE", "PEOPLE",
    "PERIOD", "PLACED", "POCKET", "POLICY", "RECORD", "REGION", "REPORT",
    "RESULT", "RETURN", "SCHOOL", "SEASON", "SECOND", "SECRET", "SELDOM",
    "SIGNAL", "SILENT", "SIMPLE", "SOCIAL", "SOURCE", "SPIRIT", "SPREAD",
    "SQUARE", "STATUS", "STREET", "STRIKE", "SYSTEM", "TARGET", "THEORY",
    "TICKET", "TRAVEL", "TUNNEL", "VALLEY", "VESSEL", "VILLAGE", "VOLUME",
    "WEALTH", "WEEKLY", "WINTER", "WONDER", "WORKER", "WRITER", "ALLIANCE",
    "AMBUSH", "BATTALION", "BUNKER", "CIPHER", "CODEBOOK", "COURIER",
    "DIVISION", "ENVELOPE", "EXCHANGE", "FRONTIER", "GARRISON", "INFANTRY",
    "INTERCEPT", "LIAISON", "OUTPOST", "PATROL", "RECON", "REGIMENT",
    "RESISTANCE", "SABOTAGE", "SENTINEL", "SQUADRON", "SURVEILLANCE",
    "TERRITORY", "TRANSPORT", "AGENT", "ALLY", "ARMY", "BOMB", "CAMP",
    "CODE", "CORE", "CREW", "FLAG", "FORT", "FUEL", "GATE", "GUNS", "HERO",
    "HILL", "HOME", "HOPE", "HOUR", "LINE", "LOAD", "MAPS", "MINE", "NAVY",
    "PLAN", "POST", "RAID", "RANK", "REAR", "ROAD", "SEND", "SHIP", "SHOT",
    "SPY", "TANK", "TROOP", "UNIT", "WALL", "WING", "ZONE",
]


def build_wordlist(true_keys: list[str]) -> list[str]:
    words = list(dict.fromkeys(COMMON_WORDS))  # de-duplicate, keep order
    for key in true_keys:
        if key not in words:
            words.append(key)
    random.shuffle(words)
    return words


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    entries = []
    for title, key, paragraph in MESSAGES:
        plaintext_normalized = normalize_text(paragraph)
        ciphertext = encrypt(paragraph, key)
        case = FEATURED_CASES.get(title, "archive")
        entries.append({
            "title": title,
            "ciphertext": ciphertext,
            "plaintext": plaintext_normalized,
            "key": key,
            "key_length": len(key),
            "length": len(plaintext_normalized.replace(" ", "")),
            "case": case,
            "featured": case != "archive",
        })

    def sort_key(e: dict) -> tuple[int, int]:
        return (0, FEATURED_ORDER.index(e["case"])) if e["featured"] else (1, 0)

    entries.sort(key=sort_key)
    for idx, e in enumerate(entries, start=1):
        e["id"] = f"msg-{idx:02d}"

    with (DATA_DIR / "messages.json").open("w", encoding="utf-8") as f:
        json.dump(entries, f, indent=2)

    # A gibberish key must NOT be in the wordlist — that's the whole point of that test case.
    word_keys = [key for title, key, _ in MESSAGES if FEATURED_CASES.get(title) != "random-key"]
    wordlist = build_wordlist(word_keys)
    with (DATA_DIR / "wordlist.txt").open("w", encoding="utf-8") as f:
        f.write("\n".join(wordlist) + "\n")

    print(f"Wrote {len(entries)} messages to {DATA_DIR / 'messages.json'}")
    print(f"Wrote {len(wordlist)} words to {DATA_DIR / 'wordlist.txt'}")


if __name__ == "__main__":
    main()
