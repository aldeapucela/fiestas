<?php

namespace Piwik\Plugins\FiestasUniqueVisitors;

use DateTimeImmutable;
use DateTimeZone;
use Exception;
use Piwik\Common;
use Piwik\Db;
use Piwik\Piwik;

/**
 * Read-only annual aggregates used by the Fiestas public endpoints.
 *
 * Matomo's regular Events report does not expose per-event unique visitors
 * for year/range periods. This method calculates the same metric directly
 * from the immutable raw visit-action log, without creating another store.
 *
 * @method static API getInstance()
 */
class API extends \Piwik\Plugin\API
{
    private const SUPPORTED_YEAR = '2026';
    private const TIMEZONE = 'Europe/Madrid';

    /**
     * Return event names, total events, and distinct Matomo visitors for one
     * category/action during the complete 2026 festival year.
     *
     * @return array<int, array{label: string, nb_events: int, nb_uniq_visitors: int}>
     */
    public function getEventUniqueCounts($idSite, $period, $date, $eventCategory, $eventAction)
    {
        $idSite = (int) $idSite;

        if ($idSite < 1 || $period !== 'year' || (string) $date !== self::SUPPORTED_YEAR) {
            throw new Exception('Only the 2026 annual period is supported.');
        }

        if (!is_string($eventCategory) || $eventCategory === '' || !is_string($eventAction) || $eventAction === '') {
            throw new Exception('An event category and action are required.');
        }

        Piwik::checkUserHasViewAccess($idSite);

        $festivalTimezone = new DateTimeZone(self::TIMEZONE);
        $utcTimezone = new DateTimeZone('UTC');
        $start = new DateTimeImmutable(self::SUPPORTED_YEAR . '-01-01 00:00:00', $festivalTimezone);
        $end = new DateTimeImmutable('2027-01-01 00:00:00', $festivalTimezone);
        $startUtc = $start->setTimezone($utcTimezone)->format('Y-m-d H:i:s');
        $endUtc = $end->setTimezone($utcTimezone)->format('Y-m-d H:i:s');

        $visitActionTable = Common::prefixTable('log_link_visit_action');
        $actionTable = Common::prefixTable('log_action');
        $sql = "
            SELECT
                COALESCE(event_name.name, '') AS label,
                COUNT(*) AS nb_events,
                COUNT(DISTINCT visit_action.idvisitor) AS nb_uniq_visitors
            FROM {$visitActionTable} AS visit_action
            INNER JOIN {$actionTable} AS event_category
                ON event_category.idaction = visit_action.idaction_event_category
                AND event_category.name = ?
            INNER JOIN {$actionTable} AS event_action
                ON event_action.idaction = visit_action.idaction_event_action
                AND event_action.name = ?
            LEFT JOIN {$actionTable} AS event_name
                ON event_name.idaction = visit_action.idaction_name
            WHERE visit_action.idsite = ?
                AND visit_action.server_time >= ?
                AND visit_action.server_time < ?
            GROUP BY event_name.name
            ORDER BY nb_uniq_visitors DESC, label ASC
        ";

        $rows = Db::get()->fetchAll($sql, [
            (string) $eventCategory,
            (string) $eventAction,
            $idSite,
            $startUtc,
            $endUtc,
        ]);

        return array_map(static function (array $row) use ($eventCategory, $eventAction): array {
            return [
                'label' => (string) ($row['label'] ?? ''),
                'nb_events' => (int) ($row['nb_events'] ?? 0),
                'nb_uniq_visitors' => (int) ($row['nb_uniq_visitors'] ?? 0),
                'Events_EventCategory' => (string) $eventCategory,
                'Events_EventAction' => (string) $eventAction,
            ];
        }, $rows);
    }
}
