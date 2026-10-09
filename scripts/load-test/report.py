#!/usr/bin/env python3
"""Build an Estonian load-test report from sanitized artifacts, without traffic."""
import argparse
import html
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_ARTIFACTS = Path(__file__).resolve().parent / 'artifacts'
PROFILE_LABELS = {'smoke': 'Eeltest', 'staged': 'Kohalik astmeline test', 'cloud': 'Pilve diagnostika', 'contention': 'Sama KP samaaegsed salvestused'}
ROUTES = {'leaderboard_ssr': 'Pingerida · SSR', 'leaderboard_rsc': 'Pingerida · RSC', 'overview_ssr': 'Ülevaade · SSR', 'overview_rsc': 'Ülevaade · RSC', 'judge_page': 'Kohtuniku leht', 'judge_save': 'Tulemuse salvestamine', 'leaderboard_verify': 'Pingerea API kontroll'}
ISSUES = {'result_count', 'computed_score_count', 'incomplete_result_audit', 'duplicate_result', 'foreign_result_identity', 'unexpected_result_exception', 'wrong_judge_provenance', 'duplicate_computed_score', 'orphan_computed_score', 'missing_result', 'missing_computed_score', 'computed_score_value', 'acknowledged_result_missing', 'acknowledged_values_not_persisted', 'acknowledged_write_outside_run_window', 'changed_without_success_acknowledgment', 'baseline_values_changed'}
ISSUE_LABELS = {'computed_score_value': 'Lõppskoor erineb sõltumatust arvutusest', 'acknowledged_values_not_persisted': 'Lõppväärtus erineb varasemast edukast vastusest', 'acknowledged_write_outside_run_window': 'Hilisem kirjutus jääb varasema kinnituse ajavahemikust välja', 'acknowledged_write_outside_run_window': 'Lõpptulemuse aeg jääb varasema kinnituse katseaknast välja', 'changed_without_success_acknowledgment': 'Muudetud tulemus ilma eduka vastuseta', 'acknowledged_result_missing': 'Eduka vastusega tulemus puudub'}


def number(value):
    if isinstance(value, bool):
        return None
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def integer(value):
    result = number(value)
    return int(result) if result is not None and result.is_integer() else None


def timestamp(value):
    if not isinstance(value, str):
        return None
    try:
        date = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if date.tzinfo is None:
            return None
        return date.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    except ValueError:
        return None


def read_artifact(directory, name):
    path = directory / name
    if not path.exists():
        return None
    if not path.is_file() or path.is_symlink() or path.stat().st_size > 25 * 1024 * 1024:
        raise ValueError('Sisend peab olema piiratud suurusega tavaline JSON-fail.')
    try:
        result = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError):
        raise ValueError('Sisendi JSON-faili lugemine ebaõnnestus.') from None
    if not isinstance(result, dict):
        raise ValueError('Sisend peab olema JSON-objekt.')
    return result


def metric_values(data, key):
    metric = data.get('metrics', {}).get(key, {})
    values = metric.get('values', {})
    return values if isinstance(values, dict) else {}


def count_metric(data, key):
    return integer(metric_values(data, key).get('count'))


def timing(values):
    if not isinstance(values, dict) or not number(values.get('max')):
        return None  # Empty threshold submetrics are not measured zero latency.
    return {key: number(values.get(field)) for key, field in [('averageMs', 'avg'), ('p95Ms', 'p(95)'), ('p99Ms', 'p(99)'), ('maximumMs', 'max')]}


def profile_summary(profile, raw):
    plan = raw.get('plan', {})
    measured_vus = integer(metric_values(raw, 'vus').get('max'))
    sampled_vus = measured_vus
    if measured_vus == 0 and (count_metric(raw, 'http_reqs') or 0) > 0:
        measured_vus = None  # A very short run can miss the periodic VU gauge.
    judges = integer(plan.get('judges'))
    planned_spectators = integer(plan.get('spectators'))
    elapsed = number(raw.get('elapsedSeconds'))
    windows = []
    for stage in plan.get('stages', []):
        label = str(stage.get('label', ''))
        if not re.fullmatch(r'(?:[0-9]{1,4}|smoke|cooldown|contention|cloud)', label):
            continue
        windows.append({'label': label, 'startSeconds': number(stage.get('start')), 'endSeconds': number(stage.get('end'))})
    planned_end = max((item['endSeconds'] for item in windows if item['endSeconds'] is not None), default=None) if profile != 'contention' else None
    measured_spectators = max(0, measured_vus - judges) if measured_vus is not None and judges is not None and profile != 'contention' else (0 if profile == 'contention' else None)
    stage_timings = []
    for stage in windows:
        measured = timing(metric_values(raw, f"request_duration{{stage:{stage['label']}}}"))
        if measured:
            stage_timings.append({'label': stage['label'], **measured})
    routes = []
    for route in ROUTES:
        measured = timing(metric_values(raw, f'request_duration{{route:{route}}}'))
        if measured:
            routes.append({'route': route, **measured})
    statuses = {}
    for attempt in raw.get('attempts', []):
        status = integer(attempt.get('status'))
        if status is not None and (status == 0 or 100 <= status <= 599):
            statuses[str(status)] = statuses.get(str(status), 0) + 1
    thresholds = []
    for value in raw.get('failedThresholds', []):
        if isinstance(value, str) and re.fullmatch(r'[a-z0-9_{}:(),.<>=% +\-]{1,180}', value):
            thresholds.append(value)
        else:
            thresholds.append('Muu lävend ületatud')
    return {'profile': profile, 'startedAt': timestamp(raw.get('startedAt')), 'finishedAt': timestamp(raw.get('finishedAt')), 'elapsedSeconds': elapsed,
            'thresholdsPassed': raw.get('passed') if isinstance(raw.get('passed'), bool) else None,
            'plannedSpectators': planned_spectators, 'judgeWorkers': judges, 'actualMaximumTotalVus': measured_vus,
            'sampledMaximumVus': sampled_vus,
            'actualMaximumSpectators': measured_spectators, 'allocatedVus': integer(metric_values(raw, 'vus_max').get('max')),
            'plannedSeconds': planned_end, 'plannedTimelineCompleted': elapsed >= planned_end if elapsed is not None and planned_end is not None else None,
            'spectatorTargetReached': measured_spectators >= planned_spectators if measured_spectators is not None and planned_spectators is not None else None,
            'requests': count_metric(raw, 'http_reqs'), 'successfulWrites': len(raw.get('writes', [])), 'attemptedWrites': len(raw.get('attempts', [])),
            'writeStatusCounts': statuses, 'http5xx': count_metric(raw, 'responses_5xx'), 'http429': count_metric(raw, 'responses_429'),
            'timeouts': count_metric(raw, 'request_timeouts'), 'otherTransportErrors': count_metric(raw, 'transport_errors'),
            'incorrect200Responses': count_metric(raw, 'correctness_failures'), 'fixtureValidationFailures': count_metric(raw, 'fixture_validation_failures'),
            'loadTiming': timing(metric_values(raw, 'http_req_duration{phase:load}')), 'waitingTiming': timing(metric_values(raw, 'http_req_waiting')),
            'receivingTiming': timing(metric_values(raw, 'http_req_receiving')), 'routeTimings': routes, 'stageTimings': stage_timings, 'failedThresholds': thresholds}


def verification_summary(raw):
    if raw is None:
        return None
    counts = raw.get('counts', {})
    acknowledgments = raw.get('acknowledgmentVerification', {})
    issue_counts = {}
    for key, value in raw.get('issueCounts', {}).items():
        count = integer(value)
        if count is not None:
            label = key if key in ISSUES else 'other_issues'
            issue_counts[label] = issue_counts.get(label, 0) + count
    statistics = raw.get('statistics', {})
    database = statistics.get('database', {})
    audit = []
    for row in statistics.get('resultChangeAudit', []):
        outcome = row.get('outcome')
        if outcome not in ['STARTED', 'SUCCEEDED', 'DENIED', 'FAILED', 'RATE_LIMITED']:
            outcome = 'UNKNOWN'
        audit.append({'outcome': outcome, 'status': integer(row.get('status')), 'events': integer(row.get('events')), 'p95DurationMs': number(row.get('p95_duration_ms')), 'p99DurationMs': number(row.get('p99_duration_ms'))})
    checked_scores = integer(raw.get('checkedScores'))
    numeric_scores_correct = checked_scores == 2000 and integer(counts.get('results')) == 2000 and integer(counts.get('computedScores')) == 2000 and not issue_counts.get('computed_score_value')
    return {'passed': raw.get('passed') if isinstance(raw.get('passed'), bool) else None, 'readOnly': raw.get('readOnly') is True,
            'all2000NumericScoresCorrect': numeric_scores_correct,
            'verifiedAt': timestamp(raw.get('verifiedAt')), 'counts': {key: integer(counts.get(key)) for key in ['teams', 'elements', 'judgeTokens', 'results', 'computedScores']},
            'checkedScores': checked_scores, 'changedResults': integer(raw.get('changedResults')),
            'acknowledgments': {key: integer(acknowledgments.get(key)) for key in ['runCount', 'attemptedRequests', 'acknowledgedRequests', 'acknowledgedWrites', 'acknowledgedValuesChecked', 'failedAttemptsPersisted', 'clockToleranceMs']},
            'issueCounts': issue_counts, 'databaseCounters': {key: integer(database.get(key)) for key in ['xact_commit', 'xact_rollback', 'blks_read', 'blks_hit', 'tup_inserted', 'tup_updated', 'tup_deleted', 'deadlocks', 'temp_bytes']},
            'resultChangeAudit': audit}


def resources(raw):
    if raw is None:
        return None
    cpu, memory = raw.get('cpu', {}), raw.get('memory', {})
    return {'cpuAverageVcpu': number(cpu.get('average')), 'cpuPeakVcpu': number(cpu.get('max')), 'cpuLimitVcpu': number(cpu.get('limit')),
            'memoryAverageMb': number(memory.get('average_mb')), 'memoryPeakMb': number(memory.get('max_mb')), 'memoryLimitMb': number(memory.get('limit_mb')),
            'since': timestamp(raw.get('window', {}).get('since')), 'until': timestamp(raw.get('window', {}).get('until'))}


def generator_summary(raw):
    if raw is None:
        return None
    return {'sampleCount': integer(raw.get('sampleCount')), 'logicalCpus': integer(raw.get('logicalCpus')), 'physicalMemoryGiB': number(raw.get('physicalMemoryGiB')),
            'cpuMinimumPercent': number(raw.get('cpuPercent', {}).get('minimum')), 'cpuMaximumPercent': number(raw.get('cpuPercent', {}).get('maximum')),
            'rssMinimumMiB': number(raw.get('rssMiB', {}).get('minimum')), 'rssMaximumMiB': number(raw.get('rssMiB', {}).get('maximum')),
            'firstSampleAt': timestamp(raw.get('firstSampleAt')), 'lastSampleAt': timestamp(raw.get('lastSampleAt'))}


def cleanup_summary(raw):
    if raw is None:
        return {'artifactPresent': False, 'completed': None}
    result = {'artifactPresent': True}
    for key in ['completed', 'cleanedUp', 'environmentDeleted', 'appServiceDeleted', 'databaseServiceDeleted', 'cloudServiceDeleted', 'temporaryResourcesDeleted', 'productionUntouched', 'temporaryVolumeDeleted', 'temporaryEnvironmentDeleted', 'productionLinkRestored', 'productionDeploymentUnchanged', 'productionHttpFollowsRedirects']:
        if isinstance(raw.get(key), bool):
            result[key] = raw[key]
    for key in ['temporaryServicesDeleted', 'productionInitialHttpStatus', 'productionHttpStatus']:
        if integer(raw.get(key)) is not None:
            result[key] = integer(raw[key])
    status = raw.get('status')
    if status in ['complete', 'completed', 'cleaned', 'deleted', 'pending', 'failed', 'partial']:
        result['status'] = status
    result['completed'] = result.get('completed', result.get('cleanedUp', True if status in ['complete', 'completed', 'cleaned', 'deleted'] else None))
    return result


def escape(value):
    return html.escape(str(value))


def fmt(value, decimals=0):
    return '—' if value is None else f'{value:.{decimals}f}'.replace('.', ',')


def seconds(value):
    return fmt(value / 1000, 3) if value is not None else '—'


def table(headers, rows):
    return '<div class="table-wrap"><table><thead><tr>' + ''.join(f'<th>{escape(item)}</th>' for item in headers) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join(f'<td>{escape(item)}</td>' for item in row) + '</tr>' for row in rows) + '</tbody></table></div>'


def build_html(report):
    profiles = report['profiles']
    parts = ['<h1>Matkamang.ee koormustest</h1>', '<p class="subtitle">Tootmisversiooni main <code>2836334</code> koopia · 100 võistkonda · 20 KP-d · üks SFO rakenduse instants</p>']
    staged = next((profile for profile in profiles if profile['profile'] == 'staged'), None)
    cloud = next((profile for profile in profiles if profile['profile'] == 'cloud'), None)
    if staged and staged['spectatorTargetReached'] is False:
        parts.append(f'<p class="finding">Kohalik astmeline test katkes {fmt(staged["elapsedSeconds"], 1)} sekundil 300 vaataja juurde tõustes. Mõõdetud maksimum oli {fmt(staged["actualMaximumSpectators"])} vaatajat ja {fmt(staged["judgeWorkers"])} kohtunikku ({fmt(staged["actualMaximumTotalVus"])} kasutajat kokku). 300 vaataja sihttaset ei saavutatud. Ajalõppe oli {fmt(staged["timeouts"])}; õnnestunud salvestusi {fmt(staged["successfulWrites"])}.</p>')
    if cloud:
        outcome = 'Lävendid täideti.' if cloud['thresholdsPassed'] is True else 'Lävendid ei olnud täidetud.' if cloud['thresholdsPassed'] is False else 'Lävendite tulemus pole kinnitatud.'
        completion = 'Plaanitud ajakava läbiti.' if cloud['plannedTimelineCompleted'] is True else 'Plaanitud ajakava ei läbitud.' if cloud['plannedTimelineCompleted'] is False else 'Ajakava läbimine pole kinnitatud.'
        target = '300 vaataja sihttaset ei saavutatud.' if cloud['spectatorTargetReached'] is False else 'Vaatajate sihttase saavutati.' if cloud['spectatorTargetReached'] is True else 'Sihttaseme saavutamine pole kinnitatud.'
        parts.append(f'<p class="finding">Pilve diagnostika kestis {fmt(cloud["elapsedSeconds"], 1)} s / plaanitud {fmt(cloud["plannedSeconds"])} s. Mõõdetud maksimum oli {fmt(cloud["actualMaximumSpectators"])} vaatajat ja {fmt(cloud["judgeWorkers"])} kohtunikku ({fmt(cloud["actualMaximumTotalVus"])} kasutajat kokku). {escape(target)} {escape(outcome)} {escape(completion)} Ajalõppe: {fmt(cloud["timeouts"])}; õnnestunud salvestusi: {fmt(cloud["successfulWrites"])}.</p>')
    else:
        parts.append('<p class="pending">Pilve diagnostika tulemus pole selles artefaktide komplektis veel olemas.</p>')
    if staged:
        hundred = next((stage for stage in staged['stageTimings'] if stage['label'] == '100'), None)
        if hundred and hundred['p95Ms'] is not None and hundred['p99Ms'] is not None and hundred['p95Ms'] < 3000 and hundred['p99Ms'] < 8000:
            parts.append('<p>Kohaliku katse 100 vaataja astme latentsus jäi seatud lävenditesse: p95 alla 3 s ja p99 alla 8 s. See kinnitab selles katses läbitud astet, mitte süsteemi kasutajate ülempiiri.</p>')
    parts.append('<h2>Tehtud päringud</h2><p>Vaataja avas SSR-lehe ja uuendas seda RSC-päringuga iga 30 sekundi järel. Pooled vaatajad kasutasid pingerida ja pooled ülevaadet. 20 kohtunikku salvestasid kokku umbes 40 tulemust minutis, igaüks oma KP-s. 300 sellist vaatajat tähendaks umbes 10 värskenduspäringut sekundis.</p>')
    parts.append(table(['Katse', 'Tegelik max: vaatajad + kohtunikud', 'Kestus, s', 'Päringuid', 'Salvestusi', '5xx', '429', 'Ajalõppe', 'Muid võrguvigu', 'Lävendid'], [[PROFILE_LABELS[p['profile']], f'{fmt(p["judgeWorkers"])} kirjutajat; VU-max mõõtmata' if p['profile'] == 'contention' and p['actualMaximumTotalVus'] is None else f'{fmt(p["actualMaximumSpectators"])} + {fmt(p["judgeWorkers"])} = {fmt(p["actualMaximumTotalVus"])}', fmt(p['elapsedSeconds'], 1), fmt(p['requests']), fmt(p['successfulWrites']), fmt(p['http5xx']), fmt(p['http429']), fmt(p['timeouts']), fmt(p['otherTransportErrors']), 'Täidetud' if p['thresholdsPassed'] is True else 'Ületatud' if p['thresholdsPassed'] is False else 'Kinnitamata'] for p in profiles]))
    if any(p['profile'] == 'contention' for p in profiles):
        parts.append('<p>Sama KP katse saatis kümme samaaegset salvestust ühe KP eri võistkondadele; „kohtunikud” tähistavad selles reas kümmet kirjutavat tööprotsessi. Lühikese katse VU-hetktõmmis võib tegeliku samaaegsuse proovistamata jätta.</p>')
    if report['contentionEvidence']['uniqueConstraintConfirmed']:
        parts.append('<p>Serveri vealogis kinnitati arvutatud skooride hulksisestuse unikaalsuspiirangu konflikt. Tulemuse salvestus kinnitatakse enne skooride ümberarvutust; seetõttu võib API veavastus saabuda pärast toortulemuse muutmist. Ümberarvutus loeb andmed enne skooride asendamise tehingut, mis jätab sama KP kirjutustele võistlusolukorra.</p>')
    for profile in profiles:
        parts.append(f'<h2>{escape(PROFILE_LABELS[profile["profile"]])}: latentsus</h2>')
        rows = [[ROUTES[item['route']], seconds(item['p95Ms']), seconds(item['p99Ms']), seconds(item['maximumMs'])] for item in profile['routeTimings']]
        parts.append(table(['Päring', 'p95, s', 'p99, s', 'Max, s'], rows))
        if profile['stageTimings']:
            parts.append(table(['Astmeline sihttase', 'p95, s', 'p99, s'], [[item['label'], seconds(item['p95Ms']), seconds(item['p99Ms'])] for item in profile['stageTimings']]))
        parts.append('<p class="note">Astme latentsus ühendab tõusu ja püsimise ning kõik päringuliigid. Sihttaseme silt ei kinnita, et tase saavutati. Tühje mõõtmisi ei kuvata.</p>')
        waiting, receiving = profile['waitingTiming'], profile['receivingTiming']
        if waiting and receiving:
            parts.append(f'<p>Vastuse alguse ooteaeg: p95 {seconds(waiting["p95Ms"])} s, p99 {seconds(waiting["p99Ms"])} s. Vastuse vastuvõtt: p95 {seconds(receiving["p95Ms"])} s, p99 {seconds(receiving["p99Ms"])} s. Need jaotused hõlmavad kõiki HTTP-päringuid.</p>')
        if profile['failedThresholds']:
            parts.append('<details><summary>Ületatud lävendid</summary><ul>' + ''.join(f'<li><code>{escape(item)}</code></li>' for item in profile['failedThresholds']) + '</ul></details>')
    parts.append('<h2>Andmete sõltumatu kontroll</h2>')
    baseline, final = report['baselineVerification'], report['finalVerification']
    if baseline:
        parts.append(f'<p>Algseis: kontrollitud {fmt(baseline["checkedScores"])} arvutatud skoori; algväärtustest muutunud tulemusi {fmt(baseline["changedResults"])}. Kontrolli tulemus: {"läbitud" if baseline["passed"] is True else "ei läbitud" if baseline["passed"] is False else "kinnitamata"}.</p>')
    if final:
        ack, counts = final['acknowledgments'], final['counts']
        if final['all2000NumericScoresCorrect']:
            parts.append('<p class="finding"><strong>Kõigi 2000 arvutatud skoori numbrilised väärtused vastasid sõltumatule arvutusele.</strong> Andmebaasis oli 2000 tulemust ja 2000 skoori. Kogu kontroll jäi siiski läbimata API vastuste ja lõppväärtuste jälje erinevuste tõttu.</p>')
        parts.append(f'<p>Lõppkontroll: {fmt(counts["results"])} tulemust ja {fmt(counts["computedScores"])} skoori; sõltumatult võrreldud {fmt(final["checkedScores"])} skoori. Kontrolli tulemus: <strong>{"läbitud" if final["passed"] is True else "ei läbitud" if final["passed"] is False else "kinnitamata"}</strong>.</p>')
        parts.append(f'<p>{fmt(ack["runCount"])} järjestikuse katse {fmt(ack["acknowledgedRequests"])} edukast vastusest kontrolliti {fmt(ack["acknowledgedValuesChecked"])} viimast unikaalset KP/võistkonna väärtust. Veavastusega päringutest siiski salvestatud tulemusi: {fmt(ack["failedAttemptsPersisted"])}.</p>')
        if (ack['failedAttemptsPersisted'] or 0) > 0:
            parts.append('<p>Need päringud tagastasid vea, kuigi tulemus muutus: toiming jäi API vaates osaliseks. Hilisem veavastusega kirjutus võib varasema eduka salvestuse väärtuse üle kirjutada; see ei tähenda, et varasem edukas väärtus jäi algselt salvestamata.</p>')
        unacknowledged = final['issueCounts'].get('changed_without_success_acknowledgment', 0)
        if unacknowledged:
            server_successes = sum(row['events'] or 0 for row in final['resultChangeAudit'] if row['status'] == 200 and row['outcome'] == 'SUCCEEDED')
            parts.append(f'<p>Muudetud tulemusi ilma kliendi eduka vastuse kinnituseta: {fmt(unacknowledged)}. Serveri audit registreeris {fmt(server_successes)} HTTP 200 vastust, klient {fmt(ack["acknowledgedRequests"])} kinnitust. Võimalik, et üks pooleli olnud kirjutus lõpetas pärast katse katkestamist; see on jälje põhjal tehtud järeldus ja põhjus pole kinnitatud.</p>')
        if final['issueCounts']:
            parts.append(table(['Leitud probleem', 'Arv'], [[ISSUE_LABELS.get(key, key), value] for key, value in final['issueCounts'].items()]))
        else:
            parts.append('<p>Lõppkontroll ei leidnud skoori-, väärtuse-, arvu-, päritolu- ega ajapiiri probleeme.</p>')
    else:
        parts.append('<p class="pending">Lõplik andmekontroll on ootel. HTTP-lävendite läbimine ei tõenda veel lõppseisu õigsust.</p>')
    parts.append('<p class="note">Kontroll kasutab oma järjestust: tabamused kahanevalt, aeg kasvavalt, võrdsed sooritused ühise kohaga. Kõiki 2000 skoori võrreldakse ilma ümberarvutuse või parandamiseta. Avalike vastuste kontroll mõõdab struktuuri; iga vahepealse pingerea numbreid ja järjekorda eraldi ei kontrollita.</p>')
    parts.append('<h2>Ressursid ja tõlgendus</h2>')
    rows = []
    for label, value in report['resources'].items():
        if value:
            rows.append([{'appStaged': 'Rakendus · kohalik test', 'databaseStaged': 'PostgreSQL · kohalik test', 'appCloud': 'Rakendus · pilvekatse', 'databaseCloud': 'PostgreSQL · pilvekatse'}[label], fmt(value['cpuAverageVcpu'], 3), fmt(value['cpuPeakVcpu'], 3), fmt(value['memoryPeakMb'], 1)])
    if rows:
        parts.append(table(['Teenuse mõõtmisaken', 'CPU keskmine, vCPU', 'CPU tipp, vCPU', 'Mälu tipp, MB'], rows))
    generator = report['localGenerator']
    if generator:
        parts.append(f'<p>Kohaliku generaatori {fmt(generator["sampleCount"])} hetktõmmist: CPU {fmt(generator["cpuMinimumPercent"], 1)}–{fmt(generator["cpuMaximumPercent"], 1)}%, RSS {fmt(generator["rssMinimumMiB"], 1)}–{fmt(generator["rssMaximumMiB"], 1)} MiB. Neis mõõtmistes CPU- ega mälupiirangut ei ilmnenud; 45-sekundilised hetktõmmised võivad lühikesed tipud vahele jätta.</p>')
    parts.append('<p>Aeglustumine oli tugevam vastuse vastuvõtmisel kui vastuse alguse ootamisel. See viitab suurte SSR/RSC vastuste edastuse või voogedastuse probleemile. Võrguühendus, kliendi vastuvõtt ja serveri vastuse voogedastus jäävad võimalikeks põhjusteks; kliendi võrku ei ole põhjusena tõendatud. Põhjuse leidmiseks tuleb profileerida rakenduse renderdamist ja vastuste suurust ning edastamist.</p><p>HTTP-kestus hõlmab saatmist, ootamist ja vastuvõttu, kuid jätab välja ühenduse ning TLS-i loomise. Katse ei mõõda brauseri failide laadimist, kliendipoolset renderdamist ega erinevaid mobiilivõrke. Tulemused kehtivad sellele andmestikule, sagedusele ja ühele SFO instantsile; need ei määra süsteemi absoluutset kasutajate maksimumi.</p>')
    parts.append('<h2>Järgmised parandussuunad</h2><ul><li>Sünkroniseeri kirjutused KP kaupa andmebaasis ning kinnita toortulemus ja selle skooride ümberarvutus ühe atomaarse tehinguna. See peab vältima sama KP skooride kustutamise ja hulksisestuse konflikti.</li><li>Profileeri ja vähenda pingerea umbes 2,8 MB alglaadimise SSR-vastust ja järgnevaid RSC-vastuseid; mõõda eraldi renderdamist, voogedastust ja võrguedastust ning korda seejärel 300 vaataja katset.</li></ul><p>Rakenduse parandusi selle katse käigus ei tehtud.</p>')
    cleanup = report['cleanup']
    parts.append('<h2>Ajutiste ressursside koristus</h2><p>' + ('Koristus on artefaktis kinnitatud.' if cleanup.get('completed') is True else 'Koristus ei ole veel kinnitatud.' if cleanup.get('completed') is None else 'Koristusartefakt ei kinnita täielikku lõpetamist.') + '</p>')
    if cleanup.get('completed') is True:
        details = []
        if cleanup.get('temporaryServicesDeleted') is not None:
            details.append(f'{fmt(cleanup["temporaryServicesDeleted"])} ajutist teenust kustutati')
        if cleanup.get('temporaryVolumeDeleted') is True and cleanup.get('temporaryEnvironmentDeleted') is True:
            details.append('ajutine andmemaht ja keskkond kustutati')
        if cleanup.get('productionLinkRestored') is True and cleanup.get('productionDeploymentUnchanged') is True:
            details.append('tootmise link taastati ja tootmispaigaldus jäi samaks')
        if details:
            parts.append('<p>' + escape('; '.join(details)) + '.</p>')
        if cleanup.get('productionHttpStatus') == 200:
            initial = cleanup.get('productionInitialHttpStatus')
            suffix = f' pärast tavapärase {initial} ümbersuunamise järgimist' if initial in [301, 302, 307, 308] and cleanup.get('productionHttpFollowsRedirects') is True else ''
            parts.append(f'<p>Tootmise HTTP-kontroll andis 200{escape(suffix)}.</p>')
    return '<!doctype html><html lang="et"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Matkamang.ee koormustest</title><style>body{font:15px/1.55 system-ui,sans-serif;color:#17212e;max-width:1120px;margin:36px auto;padding:0 24px}h1{font-size:30px;margin-bottom:8px}h2{font-size:20px;margin-top:30px}.subtitle,.note{color:#586575}.finding{padding:14px 18px;background:#fff0d9;border-left:4px solid #b86500}.pending{color:#8c5200}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:13px;margin:14px 0}th,td{padding:9px 10px;border-bottom:1px solid #dce3e9;text-align:right;vertical-align:top}th:first-child,td:first-child{text-align:left}thead{background:#edf2f6}code{font-size:12px}details{margin:12px 0}p{max-width:1000px}li{margin:4px 0}@media print{body{margin:0;font-size:11px}h2{break-after:avoid}table{font-size:10px}.table-wrap{overflow:visible}details{display:none}}</style><body>' + '\n'.join(parts) + '</body></html>\n'


def main():
    parser = argparse.ArgumentParser(description='Loo koormustesti eestikeelne koondraport olemasolevatest artefaktidest.')
    parser.add_argument('--artifacts', type=Path, default=DEFAULT_ARTIFACTS)
    parser.add_argument('--output-dir', type=Path)
    args = parser.parse_args()
    output = args.output_dir or args.artifacts
    profile_reports = []
    for profile in PROFILE_LABELS:
        raw = read_artifact(args.artifacts, f'{profile}/summary.json')
        if raw:
            profile_reports.append(profile_summary(profile, raw))
    baseline = verification_summary(read_artifact(args.artifacts, 'baseline.json'))
    final = verification_summary(read_artifact(args.artifacts, 'final-verification.json'))
    resource_reports = {key: resources(read_artifact(args.artifacts, name)) for key, name in [('appStaged', 'app-staged-final.json'), ('databaseStaged', 'database-staged-final.json'), ('appCloud', 'app-cloud-final.json'), ('databaseCloud', 'database-cloud-final.json')]}
    cleanup = cleanup_summary(read_artifact(args.artifacts, 'cleanup.json'))
    error_log = read_artifact(args.artifacts, 'contention-errors.json')
    unique_conflict = bool(error_log and re.search(r'Unique constraint failed', json.dumps(error_log), re.IGNORECASE))
    report = {'schemaVersion': 1, 'generatedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
              'scope': {'productionRevision': '2836334', 'teams': 100, 'checkpoints': 20, 'applicationInstances': 1, 'applicationRegion': 'SFO', 'refreshSeconds': 30, 'mainJudgeWorkers': 20, 'judgeWritesPerMinute': 40, 'requestTypes': ['SSR', 'RSC'], 'excluded': ['browser assets', 'client rendering', 'independent mobile networks', 'absolute capacity maximum']},
              'profiles': profile_reports, 'baselineVerification': baseline, 'finalVerification': final, 'resources': resource_reports,
              'localGenerator': generator_summary(read_artifact(args.artifacts, 'generator-summary.json')), 'cleanup': cleanup,
              'contentionEvidence': {'errorArtifactPresent': error_log is not None, 'uniqueConstraintConfirmed': unique_conflict},
              'followUp': {'applicationFixApplied': False, 'directions': ['per-checkpoint database synchronization and atomic result/score transaction', 'profile and reduce leaderboard SSR/RSC responses'], 'observedLeaderboardResponseApproxMb': 2.8},
              'pending': [label for label, value in [('finalVerification', final), ('cleanup', cleanup.get('completed'))] if value is None]}
    if baseline and final:
        before, after = baseline['databaseCounters'], final['databaseCounters']
        report['databaseCounterDeltas'] = {key: after[key] - before[key] if before[key] is not None and after[key] is not None and after[key] >= before[key] else None for key in before}
    output.mkdir(parents=True, exist_ok=True)
    (output / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + '\n')
    (output / 'report.html').write_text(build_html(report))
    print(json.dumps({'profiles': [item['profile'] for item in profile_reports], 'finalVerificationAvailable': final is not None, 'cleanupConfirmed': cleanup.get('completed') is True, 'outputs': ['report.html', 'results.json']}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, TypeError):
        raise SystemExit('Koondraporti loomine ebaõnnestus; kontrolli artefaktide vormingut ja failiõigusi.') from None
